import test from 'node:test';
import assert from 'node:assert/strict';
import { answerPublicQuestionWithFreeProvider } from '../supabase/functions/visitor-assistant/assistant.js';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

const groqAnswer = text => ({ choices: [{ message: { content: text } }] });
const baseOptions = {
  question: 'كيف أستخدم الموقع؟',
  groqApiKey: 'mock-library-free-key',
  groqFreePlanConfirmed: true,
  externalAiConsent: true,
};

test('disables all external providers unless the library Groq Free plan is explicitly confirmed', async () => {
  const requests = [];
  const result = await answerPublicQuestionWithFreeProvider({
    ...baseOptions,
    groqFreePlanConfirmed: false,
    deepseekApiKey: 'legacy-paid-key',
    qwenApiKey: 'legacy-unverified-key',
    geminiApiKey: 'legacy-key',
    fetchImpl: async url => { requests.push(url); return fakeResponse(groqAnswer('استخدم البحث.')); },
  });
  assert.deepEqual(requests, []);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_unavailable');
});

test('requires one-question consent before sending any question to Groq', async () => {
  const requests = [];
  const result = await answerPublicQuestionWithFreeProvider({
    ...baseOptions,
    externalAiConsent: false,
    fetchImpl: async url => { requests.push(url); return fakeResponse(groqAnswer('استخدم البحث.')); },
  });
  assert.deepEqual(requests, []);
  assert.equal(result.ok, false);
  assert.equal(result.consentRequired, true);
  assert.equal(result.sentToExternalModel, false);
});

test('calls only Groq-hosted Qwen after the free-plan gate and visitor consent', async () => {
  const requests = [];
  const result = await answerPublicQuestionWithFreeProvider({
    ...baseOptions,
    supabaseUrl: 'https://project.example',
    publishableKey: 'public-test-key',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      return fakeResponse(groqAnswer('استخدم مربع البحث في الموقع.'));
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer mock-library-free-key');
  const payload = JSON.parse(requests[0].init.body);
  assert.equal(payload.model, 'qwen/qwen3.8-27b');
  assert.equal(payload.messages[0].role, 'system');
  assert.equal(payload.messages[1].role, 'user');
  assert.match(payload.messages[1].content, /دليل الموقع/);
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'qwen/qwen3.8-27b');
  assert.equal(result.sentToExternalModel, true);
  assert.equal(result.text, 'استخدم مربع البحث في الموقع.');
  assert.equal(Object.hasOwn(result, 'question_id'), false);
  assert.equal(Object.hasOwn(result, 'access_token'), false);
});

test('a Groq free-tier limit error stops locally and never falls back to paid providers', async () => {
  const requests = [];
  const result = await answerPublicQuestionWithFreeProvider({
    ...baseOptions,
    deepseekApiKey: 'must-never-be-used',
    qwenApiKey: 'must-never-be-used',
    geminiApiKey: 'must-never-be-used',
    fetchImpl: async url => { requests.push(url); return fakeResponse(null, 429); },
  });
  assert.deepEqual(requests, ['https://api.groq.com/openai/v1/chat/completions']);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_failed');
  assert.equal(result.sentToExternalModel, true);
});

test('rejects sensitive model output and never returns it', async () => {
  const result = await answerPublicQuestionWithFreeProvider({
    ...baseOptions,
    fetchImpl: async () => fakeResponse(groqAnswer('اسم الطالب أحمد ورقمه 12345678')),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsafe_or_empty_output');
  assert.equal(result.sentToExternalModel, true);
  assert.equal(Object.hasOwn(result, 'text'), false);
});
