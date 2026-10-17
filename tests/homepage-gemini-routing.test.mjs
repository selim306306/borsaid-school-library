import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPublicContext, answerPublicQuestion } from '../supabase/functions/visitor-assistant/assistant.js';
import { routeVisitorAssistantQuestion } from '../visitor-assistant-flow.mjs';

test('greetings and general site questions never trigger a catalog lookup on the server', async () => {
  for (const question of ['أهلا', 'اهلا', 'ما الخدمات التي يقدمها الموقع؟', 'كيف أبحث في الفهرس؟']) {
    let lookups = 0;
    const context = await buildPublicContext(question, { supabaseUrl: 'https://test.example', publishableKey: 'public-mock', fetchImpl: async () => { lookups++; throw new Error('unexpected lookup'); } });
    assert.equal(lookups, 0, question);
    assert.equal(context.searchQuery, '', question);
    assert.deepEqual(context.books, [], question);
  }
});

test('a clear book-search request uses only the published catalog RPC', async () => {
  const calls = [];
  const context = await buildPublicContext('ابحث عن كتاب تاريخ بورسعيد', { supabaseUrl: 'https://test.example', publishableKey: 'public-mock', fetchImpl: async (url, init) => { calls.push({url,init}); return { ok:true, json:async () => [] }; } });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.url.endsWith('/rpc/search_public_catalog_v2')));
  assert.ok(context.searchQuery);
});

test('the general assistant passes greetings to Gemini first and reports the real source', async () => {
  for (const question of ['أهلا', 'ما الخدمات التي يقدمها الموقع؟']) {
    let remote = 0;
    const result = await routeVisitorAssistantQuestion(question, { askGemini: async text => { assert.equal(text, question); remote++; return {ok:true,text:'أهلاً بك، يمكنني المساعدة في استخدام الموقع.'}; }, answerLocally: async () => { throw new Error('not expected'); } });
    assert.equal(remote, 1);
    assert.equal(result.source, 'gemini');
  }
});

test('Gemini greeting requests include only public context and return no ticket or search', async () => {
  let calls = 0;
  const result = await answerPublicQuestion({ question:'أهلا', apiKey:'mock-only', model:'gemini-3.5-flash-lite', fetchImpl:async (url, init) => { calls++; assert.match(url, /generativelanguage\.googleapis\.com/); assert.match(JSON.parse(init.body).contents[0].parts[0].text, /أهلا/); return {ok:true,json:async () => ({candidates:[{content:{parts:[{text:'أهلاً بك! كيف أساعدك في استخدام الموقع؟'}]}}]})}; } });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.search_query, '');
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(Object.hasOwn(result, 'question_id'), false);
});

test('green header button opens the same Gemini-first flow, never the ticket form', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const backend = await readFile(new URL('../supabase/functions/visitor-assistant/index.ts', import.meta.url), 'utf8');
  assert.match(html, /id="headerVisitorChatShortcut"[^>]+aria-controls="visitorChatDialog"/);
  assert.match(app, /\$\('#headerVisitorChatShortcut'\)\?\.addEventListener\('click', openVisitorChat\)/);
  assert.match(app, /functions\.invoke\('visitor-assistant'/);
  assert.match(backend, /authorization, apikey, content-type, x-client-info/);
  assert.doesNotMatch(backend, /telegram|visitor_questions|\.insert\(|console\.log\(/i);
  const browserClassifier = await readFile(new URL('../visitor-catalog-intent.mjs', import.meta.url), 'utf8');
  const serverClassifier = await readFile(new URL('../supabase/functions/visitor-assistant/visitor-catalog-intent.mjs', import.meta.url), 'utf8');
  assert.equal(serverClassifier, browserClassifier);
});
