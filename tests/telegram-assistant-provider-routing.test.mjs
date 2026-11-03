import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerPublicQuestionWithFreeProvider as answerSharedQuestion } from '../supabase/functions/_shared/public-assistant.js';
import { answerPublicQuestionWithFreeProvider as answerTelegramQuestion } from '../supabase/functions/telegram-webhook/assistant.js';
import { answerPublicQuestionWithFreeProvider as answerVisitorQuestion } from '../supabase/functions/visitor-assistant/assistant.js';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('Telegram assistant does not touch legacy paid or unverified provider credentials', async () => {
  const requests = [];
  const result = await answerTelegramQuestion({
    question: 'ما الخدمات التي يقدمها الموقع؟',
    deepseekApiKey: 'legacy-paid-key',
    qwenApiKey: 'legacy-unverified-key',
    geminiApiKey: 'legacy-key',
    groqApiKey: 'mock-library-key',
    groqFreePlanConfirmed: false,
    externalAiConsent: true,
    fetchImpl: async url => { requests.push(url); return fakeResponse({ choices: [{ message: { content: 'إجابة.' } }] }); },
  });
  assert.deepEqual(requests, []);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_unavailable');
});

test('Telegram provider uses only Groq-hosted Qwen after the free-plan gate', async () => {
  const requests = [];
  const result = await answerTelegramQuestion({
    question: 'ما الخدمات التي يقدمها الموقع؟',
    groqApiKey: 'test-only-free-key',
    groqFreePlanConfirmed: true,
    externalAiConsent: true,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return fakeResponse({ choices: [{ message: { content: 'يعرض الموقع الفهرس والقراءة الرقمية.' } }] });
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-only-free-key');
  assert.equal(JSON.parse(requests[0].init.body).model, 'qwen/qwen3.8-27b');
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'qwen/qwen3.8-27b');
  assert.equal(result.text, 'يعرض الموقع الفهرس والقراءة الرقمية.');
});

test('general knowledge is enabled only for the public website chat, not shared ticket or Telegram paths', async () => {
  const run = async answer => {
    let payload;
    const result = await answer({
      question: 'لماذا تبدو السماء زرقاء؟',
      groqApiKey: 'test-only-free-key',
      groqFreePlanConfirmed: true,
      externalAiConsent: true,
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
        payload = JSON.parse(init.body);
        return fakeResponse({ choices: [{ message: { content: 'بسبب تشتت الضوء في الغلاف الجوي.' } }] });
      },
    });
    assert.equal(result.ok, true);
    return payload.messages[0].content;
  };
  const visitorInstruction = await run(answerVisitorQuestion);
  const sharedInstruction = await run(answerSharedQuestion);
  const telegramInstruction = await run(answerTelegramQuestion);

  assert.match(visitorInstruction, /اعتمادًا على معرفتك العامة/);
  assert.match(sharedInstruction, /دليل الموقع والبيانات العامة المنشورة المرفقة فقط/);
  assert.match(telegramInstruction, /دليل الموقع والبيانات العامة المنشورة المرفقة فقط/);
});

test('published news archive is loaded for visitor-assistant questions but never for Telegram', async () => {
  const archive = { items: [{
    title_ar: 'خبر عام خاص باختبار مسار الزوار',
    summary_ar: 'ملخص عام منشور للاختبار يثبت تمرير الأرشيف للمساعد المقصود.',
    source_name: 'مكتبة الإسكندرية',
    source_url: 'https://www.bibalex.org/en/news/details?documentid=46381',
    published_at: '2026-11-02',
  }] };
  const run = async (answer, requests) => answer({
    question: 'ما أحدث أخبار مكتبة الإسكندرية؟',
    groqApiKey: 'test-only-free-key',
    groqFreePlanConfirmed: true,
    externalAiConsent: true,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.startsWith('https://selim306306.github.io/borsaid-school-library/news.json')) return fakeResponse(archive);
      if (url === 'https://api.groq.com/openai/v1/chat/completions') return fakeResponse({ choices: [{ message: { content: 'إجابة اختبار.' } }] });
      throw new Error(`unexpected request: ${url}`);
    },
  });
  const visitorRequests = [];
  const telegramRequests = [];
  const visitorResult = await run(answerVisitorQuestion, visitorRequests);
  const telegramResult = await run(answerTelegramQuestion, telegramRequests);
  const visitorModelRequest = visitorRequests.find(request => request.url === 'https://api.groq.com/openai/v1/chat/completions');
  const telegramModelRequest = telegramRequests.find(request => request.url === 'https://api.groq.com/openai/v1/chat/completions');
  const visitorMessages = JSON.parse(visitorModelRequest.init.body).messages;
  const telegramMessages = JSON.parse(telegramModelRequest.init.body).messages;

  assert.equal(visitorResult.ok, true);
  assert.equal(visitorRequests.filter(request => request.url.startsWith('https://selim306306.github.io/borsaid-school-library/news.json')).length, 1);
  assert.match(visitorMessages[1].content, /خبر عام خاص باختبار مسار الزوار/);
  assert.match(visitorMessages[0].content, /أرشيف الأخبار المنشور/);
  assert.match(visitorMessages[0].content, /بالكلمات العربية لا بالأرقام/);
  assert.equal(telegramResult.ok, true);
  assert.equal(telegramRequests.length, 1);
  assert.doesNotMatch(telegramMessages[1].content, /خبر عام خاص باختبار مسار الزوار/);
  assert.doesNotMatch(telegramMessages[0].content, /لا تدّع أنك تحتاج إلى تصفح الويب/);
  assert.doesNotMatch(telegramMessages[0].content, /بالكلمات العربية لا بالأرقام/);
});

test('Telegram wiring reads only the project-specific Groq Free variables', async () => {
  const source = await readFile(new URL('../supabase/functions/telegram-webhook/index.ts', import.meta.url), 'utf8');
  assert.match(source, /LIBRARY_GROQ_FREE_PLAN_API_KEY/);
  assert.match(source, /LIBRARY_GROQ_FREE_PLAN_CONFIRMED/);
  assert.doesNotMatch(source, /GEMINI_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY/);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com|api\.deepseek\.com|dashscope\.aliyuncs\.com/);
});
