import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerPublicQuestionWithFreeProvider, buildPublicContext, PUBLIC_SITE_GUIDE } from '../supabase/functions/visitor-assistant/assistant.js';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

const publishedNewsArchive = {
  updated_at: '2026-11-03T11:57:30.370Z',
  items: [
    { id: 'older', title_ar: 'خبر موثق أقدم عن مكتبة الإسكندرية', summary_ar: 'ملخص أقدم من الأرشيف المنشور.', source_name: 'مكتبة الإسكندرية', source_url: 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=9001', published_at: '2026-11-01', scope: 'libraries' },
    { id: 'newest', title_ar: 'خبر موثق أحدث عن برنامج المكتبة', summary_ar: 'ملخص عربي منشور يشرح الخبر الأحدث من المصدر الرسمي.', source_name: 'مكتبة الإسكندرية', source_url: 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=9002&utm_source=tracking-marker&token=private-test-token&email=private%40example.test&id=unneeded-id&articleid=unneeded-article&newsid=unneeded-news&p=unneeded-p&page=unneeded-page#private-fragment', published_at: '2026-11-02', scope: 'libraries', private_note: 'must not be forwarded' },
    { id: 'unsafe-url', title_ar: 'سجل بعنوان غير صالح', summary_ar: 'هذا السجل غير مقبول لأنه ليس رابطًا آمنًا.', source_name: 'مصدر غير صالح', source_url: 'http://news.example/item', published_at: '2026-11-03' },
  ],
};

test('blocks private student questions before public lookup or any model request', async () => {
  let fetchCalls = 0;
  const result = await answerPublicQuestionWithFreeProvider({
    question: 'اسم الطالب أحمد ورقم إعارة 12345678',
    groqApiKey: 'mock-only',
    groqFreePlanConfirmed: true,
    externalAiConsent: true,
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not be called'); },
  });
  assert.equal(result.private, true);
  assert.equal(fetchCalls, 0);
  assert.equal(result.text.includes('أحمد'), false);
  assert.equal(result.sentToExternalModel, false);
});

test('public guide contains verified PDF scope and says not to infer PDFs from catalog entries', () => {
  assert.match(PUBLIC_SITE_GUIDE, /حي بن يقظان/);
  assert.match(PUBLIC_SITE_GUIDE, /الجزآن الأول والثاني/);
  assert.match(PUBLIC_SITE_GUIDE, /باب الأسد والثور/);
  assert.match(PUBLIC_SITE_GUIDE, /ليس الكتاب كاملًا/);
});

test('public catalog lookup sends only the public search RPC and yields bounded published records', async () => {
  const calls = [];
  const context = await buildPublicContext('هل يوجد كتاب عن تاريخ بورسعيد؟', {
    supabaseUrl: 'https://project.example',
    publishableKey: 'public-test-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse([{ title: 'تاريخ بورسعيد', author: 'مؤلف منشور', available_copies: 1, private_field: 'must not leak' }]);
    },
  });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.url === 'https://project.example/rest/v1/rpc/search_public_catalog_v2'));
  assert.ok(calls.every(call => call.init.method === 'POST'));
  assert.deepEqual(JSON.parse(calls[0].init.body).p_limit, 6);
  assert.equal(context.books.length, 1);
  assert.equal(context.books[0].title, 'تاريخ بورسعيد');
  assert.equal(Object.hasOwn(context.books[0], 'private_field'), false);
  assert.ok(context.searchQuery);
  assert.match(context.context, /نتائج الفهرس العام المنشورة/);
});

test('latest-news context uses only dated HTTPS records from the public archive, newest first', async () => {
  const calls = [];
  const context = await buildPublicContext('ما أحدث أخبار مكتبة الإسكندرية؟', {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse(publishedNewsArchive);
    },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/selim306306\.github\.io\/borsaid-school-library\/news\.json/);
  assert.deepEqual(context.news.map(({ title_ar, summary_ar, source_name, source_url, published_at }) => ({ title_ar, summary_ar, source_name, source_url, published_at })), [
    { title_ar: 'خبر موثق أحدث عن برنامج المكتبة', summary_ar: 'ملخص عربي منشور يشرح الخبر الأحدث من المصدر الرسمي.', source_name: 'مكتبة الإسكندرية', source_url: 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=9002', published_at: '2026-11-02' },
    { title_ar: 'خبر موثق أقدم عن مكتبة الإسكندرية', summary_ar: 'ملخص أقدم من الأرشيف المنشور.', source_name: 'مكتبة الإسكندرية', source_url: 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=9001', published_at: '2026-11-01' },
  ]);
  assert.equal(JSON.stringify(context.news).includes('private_note'), false);
  assert.doesNotMatch(context.context, /tracking-marker|private-test-token|private(?:%40|@)example|private-fragment|unneeded-/);
  assert.match(context.context, /2026-11-02/);
  assert.match(context.context, /مكتبة الإسكندرية/);
  assert.match(context.context, /ملخص عربي منشور يشرح الخبر الأحدث/);
});

test('latest-news answers include the published archive details and do not claim web browsing is needed', async () => {
  let modelRequest;
  const result = await answerPublicQuestionWithFreeProvider({
    question: 'ما أحدث أخبار مكتبة الإسكندرية؟',
    groqApiKey: 'mock-only',
    groqFreePlanConfirmed: true,
    externalAiConsent: true,
    fetchImpl: async (url, init) => {
      if (url.startsWith('https://selim306306.github.io/borsaid-school-library/news.json')) return fakeResponse(publishedNewsArchive);
      if (url === 'https://api.groq.com/openai/v1/chat/completions') {
        modelRequest = JSON.parse(init.body);
        return fakeResponse({ choices: [{ message: { content: 'خبر برنامج المكتبة منشور في الثاني من نوفمبر عام ألفين وستة وعشرين، وخبر المكتبة الأقدم في الأول من نوفمبر عام ألفين وستة وعشرين. المصدر: مكتبة الإسكندرية.' } }] });
      }
      throw new Error(`unexpected public request: ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.match(modelRequest.messages[1].content, /خبر موثق أحدث عن برنامج المكتبة/);
  assert.match(modelRequest.messages[1].content, /2026-11-02/);
  assert.match(modelRequest.messages[1].content, /مكتبة الإسكندرية/);
  assert.match(modelRequest.messages[1].content, /ملخص عربي منشور يشرح الخبر الأحدث/);
  assert.match(modelRequest.messages[0].content, /لا تدّع أنك تحتاج إلى تصفح الويب/);
  assert.match(modelRequest.messages[0].content, /بالكلمات العربية لا بالأرقام/);
  assert.match(modelRequest.messages[0].content, /اسم المصدر دون روابط أو معرّفات رقمية/);
  assert.doesNotMatch(JSON.stringify(modelRequest), /tracking-marker|private-test-token|private(?:%40|@)example|private-fragment|unneeded-/);
});

test('the public Edge function has only the gated free Groq credential and no legacy paid-provider wiring', async () => {
  const backend = await readFile(new URL('../supabase/functions/visitor-assistant/index.ts', import.meta.url), 'utf8');
  assert.match(backend, /LIBRARY_GROQ_FREE_PLAN_API_KEY/);
  assert.match(backend, /LIBRARY_GROQ_FREE_PLAN_CONFIRMED/);
  assert.doesNotMatch(backend, /GEMINI_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY/);
  assert.doesNotMatch(backend, /generativelanguage\.googleapis\.com|api\.deepseek\.com|dashscope\.aliyuncs\.com/);
});
