import test from 'node:test';
import assert from 'node:assert/strict';
import { answerPublicQuestion, buildPublicContext, PUBLIC_SITE_GUIDE } from '../supabase/functions/visitor-assistant/assistant.js';

function fakeResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('blocks a private student question before any public lookup or Gemini request', async () => {
  let fetchCalls = 0;
  const result = await answerPublicQuestion({
    question: 'اسم الطالب أحمد ورقم إعارة 12345678',
    apiKey: 'test-only-not-a-real-key',
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not be called'); },
  });
  assert.equal(result.private, true);
  assert.equal(fetchCalls, 0);
  assert.equal(result.text.includes('أحمد'), false);
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
  assert.equal(calls[0].url, 'https://project.example/rest/v1/rpc/search_public_catalog_v2');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body).p_limit, 6);
  assert.equal(context.books.length, 1);
  assert.equal(context.books[0].title, 'تاريخ بورسعيد');
  assert.equal(Object.hasOwn(context.books[0], 'private_field'), false);
  assert.ok(context.searchQuery);
  assert.match(context.context, /نتائج الفهرس العام المنشورة/);
});

test('defaults to the documented stable Gemini 3.8 Flash model without a project-wide override', async () => {
  const requests = [];
  const result = await answerPublicQuestion({
    question: 'كيف أستخدم الموقع؟',
    apiKey: 'mock-server-key',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      return fakeResponse({ candidates: [{ content: { parts: [{ text: 'استخدم مربع البحث في الموقع.' }] } }] });
    },
  });
  const gemini = requests.find(request => request.url.includes('generativelanguage.googleapis.com'));
  assert.ok(gemini);
  assert.match(gemini.url, /models\/gemini-3\.8-flash:generateContent/);
  assert.equal(result.model, 'gemini-3.8-flash');
});

test('Gemini call uses the configured server-side key, passes only public context, and returns no storage ticket', async () => {
  const requests = [];
  const result = await answerPublicQuestion({
    question: 'كيف أبحث عن كتاب؟',
    apiKey: 'mock-server-key',
    model: 'gemini-3.8-flash',
    supabaseUrl: 'https://project.example',
    publishableKey: 'public-test-key',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init });
      if (url.includes('generativelanguage.googleapis.com')) {
        return fakeResponse({ candidates: [{ content: { parts: [{ text: 'اكتب عنوان الكتاب في مربع البحث.' }] } }] });
      }
      return fakeResponse([]);
    },
  });
  const gemini = requests.find(request => request.url.includes('generativelanguage.googleapis.com'));
  assert.ok(gemini);
  assert.equal(gemini.init.headers['x-goog-api-key'], 'mock-server-key');
  assert.match(JSON.stringify(JSON.parse(gemini.init.body)), /دليل الموقع/);
  assert.equal(result.ok, true);
  assert.equal(result.text, 'اكتب عنوان الكتاب في مربع البحث.');
  assert.equal(Object.hasOwn(result, 'question_id'), false);
  assert.equal(Object.hasOwn(result, 'access_token'), false);
  assert.equal(Object.hasOwn(result, 'reply_code'), false);
});

test('rejects a sensitive Gemini answer and never returns it to the caller', async () => {
  const result = await answerPublicQuestion({
    question: 'كيف أبحث عن كتاب؟',
    apiKey: 'mock-server-key',
    supabaseUrl: 'https://project.example',
    publishableKey: 'public-test-key',
    fetchImpl: async url => url.includes('generativelanguage.googleapis.com')
      ? fakeResponse({ candidates: [{ content: { parts: [{ text: 'اسم الطالب أحمد ورقمه 12345678' }] } }] })
      : fakeResponse([]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsafe_or_empty_output');
  assert.equal(Object.hasOwn(result, 'text'), false);
});
