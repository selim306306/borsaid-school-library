import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { answerPublicQuestionWithFreeProvider } from '../supabase/functions/visitor-assistant/assistant.js';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('Telegram assistant does not touch legacy paid or unverified provider credentials', async () => {
  const requests = [];
  const result = await answerPublicQuestionWithFreeProvider({
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
  const result = await answerPublicQuestionWithFreeProvider({
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

test('Telegram wiring reads only the project-specific Groq Free variables', async () => {
  const source = await readFile(new URL('../supabase/functions/telegram-webhook/index.ts', import.meta.url), 'utf8');
  assert.match(source, /LIBRARY_GROQ_FREE_PLAN_API_KEY/);
  assert.match(source, /LIBRARY_GROQ_FREE_PLAN_CONFIRMED/);
  assert.doesNotMatch(source, /GEMINI_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY/);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com|api\.deepseek\.com|dashscope\.aliyuncs\.com/);
});
