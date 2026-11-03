import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerPublicQuestionWithFreeProvider } from '../supabase/functions/visitor-assistant/assistant.js';
import { routeVisitorAssistantQuestion } from '../visitor-assistant-flow.mjs';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('greetings and general site questions never trigger a public catalog lookup', async () => {
  for (const question of ['أهلا', 'اهلا', 'ما الخدمات التي يقدمها الموقع؟', 'كيف أبحث في الفهرس؟']) {
    let lookups = 0;
    const result = await routeVisitorAssistantQuestion(question, {
      askFreeModel: async () => ({ ok: false, reason: 'provider_unavailable', sentToExternalModel: false }),
      answerLocally: async () => ({ text: 'إجابة محلية.' }),
    });
    assert.equal(result.source, 'local-fallback', question);
    assert.equal(lookups, 0, question);
  }
});

test('a clear book-search request uses only the published catalog RPC', async () => {
  const calls = [];
  const context = await (await import('../supabase/functions/visitor-assistant/assistant.js')).buildPublicContext('ابحث عن كتاب تاريخ بورسعيد', {
    supabaseUrl: 'https://test.example',
    publishableKey: 'public-mock',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return fakeResponse([]); },
  });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.url.endsWith('/rpc/search_public_catalog_v2')));
  assert.ok(context.searchQuery);
});

test('the browser asks for one-question consent before using the configured free model', async () => {
  let sent = false;
  const result = await routeVisitorAssistantQuestion('أهلا', {
    askFreeModel: async (text, options) => {
      assert.equal(text, 'أهلا');
      assert.equal(options.externalAiConsent, false);
      return { ok: false, consent_required: true, sentToExternalModel: false };
    },
    answerLocally: async () => { throw new Error('not expected'); },
  });
  assert.equal(result.needsExternalModelConsent, true);
  assert.equal(result.sentToExternalModel, false);
  assert.equal(sent, false);
});

test('a consented response uses only the Groq Qwen model and contains no ticket token', async () => {
  const requests = [];
  const result = await answerPublicQuestionWithFreeProvider({
    question: 'كيف أستخدم الموقع؟',
    groqApiKey: 'mock-free-key',
    groqFreePlanConfirmed: true,
    externalAiConsent: true,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return fakeResponse({ choices: [{ message: { content: 'أهلاً بك! استخدم مربع البحث.' } }] });
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(JSON.parse(requests[0].init.body).model, 'qwen/qwen3.8-27b');
  assert.equal(result.provider, 'groq');
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result, 'question_id'), false);
});

test('public assistant wiring never configures Gemini or direct DeepSeek/DashScope endpoints', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const backend = await readFile(new URL('../supabase/functions/visitor-assistant/index.ts', import.meta.url), 'utf8');
  assert.match(html, /id="headerVisitorChatShortcut"[^>]+aria-controls="visitorChatDialog"/);
  assert.match(app, /functions\.invoke\('visitor-assistant'/);
  assert.match(backend, /LIBRARY_GROQ_FREE_PLAN_API_KEY/);
  assert.match(backend, /LIBRARY_GROQ_FREE_PLAN_CONFIRMED/);
  assert.doesNotMatch(backend, /GEMINI_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY/);
  assert.doesNotMatch(backend, /generativelanguage\.googleapis\.com|api\.deepseek\.com|dashscope\.aliyuncs\.com/);
  const browserClassifier = await readFile(new URL('../visitor-catalog-intent.mjs', import.meta.url), 'utf8');
  const serverClassifier = await readFile(new URL('../supabase/functions/_shared/visitor-catalog-intent.mjs', import.meta.url), 'utf8');
  assert.equal(serverClassifier, browserClassifier);
});
