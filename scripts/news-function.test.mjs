import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, readBoundedBody, allowedUrl, fetchSource, extractArticle, candidateOk, generateArabicSummary, verifySummary, validatePayload, processNews, _internal } from '../supabase/functions/school-library-news/core.mjs';
import { signedHeaders, buildPayload, validateResponse, itemId } from './news-publisher.mjs';

const secret = 'test-secret';
const sign = async (ts, nonce, body, key = secret) => {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`v1\n${ts}\n${nonce}\n${body}`));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
const H = async (body, ts = new Date().toISOString(), nonce = crypto.randomUUID(), key = secret) => [new Headers({ 'X-News-Timestamp': ts, 'X-News-Nonce': nonce, 'X-News-Signature': await sign(ts, nonce, body, key) }), nonce];
const today = new Date();
const dateISO = today.toISOString().slice(0, 10);
const html = (url, title = 'School libraries update', date = dateISO, body = 'School library services improved for students and school librarians with practical guidance and resources.') => `<html><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: title, datePublished: date })}</script><main>${body}</main></html>`;
const response = (body, contentType = 'text/html') => new Response(body, { status: 200, headers: { 'content-type': contentType } });

 test('authenticate accepts publisher signedHeaders with actual ISO payload, and rejects tamper, stale timestamp, and wrong secret', async () => {
  const payload = buildPayload({ archive: { schema_version: 1, updated_at: dateISO, items: [] }, now: new Date(), nonce: crypto.randomUUID(), env: {} });
  const raw = JSON.stringify(payload);
  const headers = signedHeaders(raw, secret, payload.timestamp, payload.nonce);
  assert.equal(await authenticate(new Headers(headers), raw, secret), true);
  await assert.rejects(() => authenticate(new Headers(headers), raw, secret), /replay/);
  const [tampered] = await H(raw + ' ', new Date().toISOString(), crypto.randomUUID());
  await assert.rejects(() => authenticate(tampered, raw, secret), /unauthorized/);
  const stale = new Date(Date.now() - 121000).toISOString();
  const [staleHeaders] = await H(raw, stale);
  await assert.rejects(() => authenticate(staleHeaders, raw, secret), /unauthorized/);
  const [wrong] = await H(raw, new Date().toISOString(), crypto.randomUUID(), 'wrong-secret');
  await assert.rejects(() => authenticate(wrong, raw, secret), /unauthorized/);
 });

test('validatePayload directly accepts matching header/body payload and rejects malformed fields', () => {
  const p = { schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '123', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] };
  assert.deepEqual(validatePayload(p), p);
  assert.throws(() => validatePayload({ ...p, repository: 'other' }), /payload/);
  assert.throws(() => validatePayload({ ...p, timestamp: new Date().toISOString().replace('Z', '') }), /payload/);
 });

test('bounds streamed body before parse', async () => { const req = new Request('http://x', { method: 'POST', body: 'x'.repeat(12001) }); await assert.rejects(() => readBoundedBody(req, 12000), /too_large/); });

test('allowedUrl blocks credentials, ports, encoded slash, and unsafe hosts', () => {
  assert.equal(allowedUrl('https://www.ifla.org/news/a'), true);
  assert.equal(allowedUrl('https://user:pass@www.ifla.org/news/a'), false);
  assert.equal(allowedUrl('https://www.ifla.org:8443/news/a'), false);
  assert.equal(allowedUrl('https://www.ifla.org/news/a%2Fb'), false);
  assert.equal(allowedUrl('https://evil.example/news/a'), false);
  assert.equal(allowedUrl('http://www.ifla.org/news/a'), false);
  assert.equal(allowedUrl('https://www.ifla.org.evil/news/a'), false);
  assert.equal(allowedUrl('https://www.unesco.org/en/articles/a'), true);
  assert.equal(allowedUrl('https://www.unesco.org/en/other/a'), false);
 });

test('same-host redirects including trailing slash are allowed, evil redirects are blocked', async () => {
  let calls = 0;
  const same = await fetchSource('https://www.ifla.org/news/a', async url => {
    calls++;
    return calls === 1 ? new Response('', { status: 302, headers: { location: 'https://www.ifla.org/news/a/' } }) : response(html(url));
  });
  assert.equal(same.url, 'https://www.ifla.org/news/a');
  await assert.rejects(() => fetchSource('https://www.ifla.org/news/x', async () => new Response('', { status: 302, headers: { location: 'https://evil.example/news/x' } })), /url/);
 });

test('extracts @graph main NewsArticle and excludes Featured News content', () => {
  const source = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'NewsArticle', headline: 'Graph school libraries', datePublished: dateISO }] })}</script><main>Primary school library report. Featured News irrelevant item must not be included.<div>Featured News</div><p>Featured school library item irrelevant</p></main>`;
  const a = extractArticle(source, 'https://www.ifla.org/news/graph');
  assert.equal(a.title, 'Graph school libraries');
  assert.equal(a.published_at, dateISO);
  assert.match(a.body, /Primary school library report/);
  assert.doesNotMatch(a.body, /Featured school library item/);
 });

test('candidateOk rejects invalid calendar date without throwing', () => {
  const a = extractArticle(html('https://www.ifla.org/news/bad', 'School libraries', '2026-02-30'), 'https://www.ifla.org/news/bad');
  assert.equal(a.published_at, '2026-02-30');
  assert.equal(candidateOk(a, [], today), false);
 });

const geminiMock = (...texts) => { let i = 0; return async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: texts[Math.min(i++, texts.length - 1)] }] } }] }) }); };
const validSummary = body => JSON.stringify({ title_ar: 'تحديث مهم للمكتبات المدرسية', summary_ar: 'هذا ملخص عربي موثق للمادة المنشورة ويعرض الخبر بإيجاز دون نسخ النص الكامل أو إضافة ادعاءات غير موجودة.', relevance: true, claims: [{ ar: 'تحسن', quote: body.slice(0, 38) }] });

test('summary rejects empty claims and nonliteral quotes', async () => {
  const a = { published_at: dateISO, body: 'School library services improved for students and school librarians with practical guidance and resources.' };
  const empty = JSON.stringify({ title_ar: 'عنوان عربي طويل مناسب للأخبار المدرسية', summary_ar: 'هذا ملخص عربي موثق للمادة المنشورة ويعرض الخبر بإيجاز دون نسخ النص الكامل أو إضافة ادعاءات غير موجودة.', relevance: true, claims: [] });
  await assert.rejects(() => generateArabicSummary(a, 'k', geminiMock(empty)), /summary/);
  const nonliteral = JSON.stringify({ title_ar: 'عنوان عربي طويل مناسب للأخبار المدرسية', summary_ar: 'هذا ملخص عربي موثق للمادة المنشورة ويعرض الخبر بإيجاز دون نسخ النص الكامل أو إضافة ادعاءات غير موجودة.', relevance: true, claims: [{ ar: 'نص', quote: 'School library services improved for students and librarians' }] });
  await assert.rejects(() => generateArabicSummary(a, 'k', geminiMock(nonliteral)), /summary/);
 });

test('processNews uses per-source six article budget and still discovers ALA', async () => {
  const original = [..._internal.DISCOVERY];
  try {
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, 'https://www.ifla.org/news/', 'https://www.ala.org/aasl/news');
    const iflaLinks = Array.from({ length: 7 }, (_, i) => `<a href="https://www.ifla.org/news/old-${i}">old</a>`).join('');
    let alaArticleFetched = false;
    const fetcher = async url => {
      if (url === 'https://www.ifla.org/news/') return response(`<main>${iflaLinks}</main>`);
      if (url === 'https://www.ala.org/aasl/news') return response('<a href="https://www.ala.org/news/today">today</a>');
      if (url.startsWith('https://www.ifla.org/news/old-')) return response(html(url, 'Old school libraries', '2020-01-01'));
      if (url === 'https://www.ala.org/news/today') { alaArticleFetched = true; return response(html(url, 'School libraries today', dateISO)); }
      throw new Error('unexpected');
    };
    const result = await processNews({ schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] }, { fetcher, geminiKey: 'k' });
    assert.equal(alaArticleFetched, true);
    assert.equal(result.items.length, 0);
    assert.equal(result.rejected_count, 7);
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });

test('processNews ALA immediate-release article yields one validated auto-SHA item with no images', async () => {
  const original = [..._internal.DISCOVERY];
  try {
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, 'https://www.ala.org/aasl/news');
    const releaseDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const sourceBody = `For immediate release | ${releaseDate}. School library services improved for students and school librarians with practical guidance and resources.`;
    const articleUrl = 'https://www.ala.org/news/release';
    const first = validSummary(sourceBody);
    const verify = JSON.stringify({ faithful: true, directly_school_library: true, dates_match: true, no_unsupported_claims: true });
    // The first Gemini response is the exact-quote summary and the second is the verifier.
    let generation = 0;
    const mockedResult = await processNews({ schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] }, { fetcher: async (url, opts) => {
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: generation++ ? verify : first }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      return url === _internal.DISCOVERY[0] ? response(`<a href="${articleUrl}">release</a>`) : response(`<meta property="og:title" content="School library services update"><main>${sourceBody}</main>`);
    }, geminiKey: 'k' });
    assert.equal(mockedResult.items.length, 1);
    const item = validateResponse(mockedResult, today).items[0];
    assert.equal(item.id, itemId(articleUrl));
    assert.equal(item.scope, 'school-library');
    assert.equal(Object.hasOwn(item, 'image_url'), false);
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });

test('processNews returns no news when all sources fail or verification is invalid', async () => {
  const original = [..._internal.DISCOVERY];
  try {
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, 'https://www.ifla.org/news/', 'https://www.ala.org/aasl/news');
    const payload = { schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] };
    const failed = await processNews(payload, { fetcher: async () => { throw new Error('down'); }, geminiKey: 'k' });
    assert.equal(failed.items.length, 0); assert.equal(failed.rejected_count, 2);
    const body = 'School library services improved for students and school librarians with practical guidance and resources.';
    const invalid = await processNews({ ...payload, nonce: crypto.randomUUID() }, { fetcher: async url => url === _internal.DISCOVERY[0] ? response('<a href="https://www.ifla.org/news/a">a</a>') : response(`<main>${body}</main>`), geminiKey: 'k' });
    assert.equal(invalid.items.length, 0);
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });
