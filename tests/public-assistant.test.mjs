import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerPublicQuestionWithFreeProvider, buildPublicContext, PUBLIC_SITE_GUIDE } from '../supabase/functions/visitor-assistant/assistant.js';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

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

test('the public Edge function has only the gated free Groq credential and no legacy paid-provider wiring', async () => {
  const backend = await readFile(new URL('../supabase/functions/visitor-assistant/index.ts', import.meta.url), 'utf8');
  assert.match(backend, /LIBRARY_GROQ_FREE_PLAN_API_KEY/);
  assert.match(backend, /LIBRARY_GROQ_FREE_PLAN_CONFIRMED/);
  assert.doesNotMatch(backend, /GEMINI_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY/);
  assert.doesNotMatch(backend, /generativelanguage\.googleapis\.com|api\.deepseek\.com|dashscope\.aliyuncs\.com/);
});
