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
  assert.equal(allowedUrl('https://www.bibalex.org/en/news/Details.aspx?DocumentID=46369'), true);
  assert.equal(allowedUrl('https://www.bibalex.org/news/Details?DocumentID=46369'), true);
  assert.equal(allowedUrl('https://www.bibalex.org/en/news/details?documentid=46369'), true);
  assert.equal(allowedUrl('https://www.bibalex.org/news/other?DocumentID=46369'), false);
  assert.equal(allowedUrl('https://www.darelkotob.gov.eg/ar-eg/Pages/news-details.aspx?nid=286'), true);
  assert.equal(allowedUrl('https://www.eifl.net/news/public-library-innovation-award'), true);
  assert.equal(allowedUrl('https://www.bibalex.org/en/news/'), false);
  assert.equal(allowedUrl('https://www.darelkotob.gov.eg/ar-eg/Pages/News.aspx'), false);
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

test('candidateOk accepts library news across types and library-linked reading, but rejects unrelated reading news', () => {
  const samples = [
    { url: 'https://www.ala.org/news/2026/10/public-library-reading-program', title: 'Public libraries launch a reading program', body: 'A public library runs community reading sessions and shares attendance information.' },
    { url: 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=46369', title: 'University libraries publish new research', body: 'University librarians and research libraries describe new open access services.' },
    { url: 'https://www.darelkotob.gov.eg/ar-eg/Pages/news-details.aspx?nid=286', title: 'افتتاح مكتبة عامة جديدة', body: 'افتتحت دار الكتب مكتبة عامة وتوفر خدمات القراءة للجمهور.' },
    { url: 'https://www.eifl.net/news/library-access-programme', title: 'Bibliothèque municipale opens a digital collection', body: 'La bibliothèque municipale offers a new digital service to its readers.' },
  ];
  for (const sample of samples) assert.equal(candidateOk({ ...sample, published_at: dateISO }, [], today), true, sample.url);
  assert.equal(candidateOk({ url: samples[0].url, title: 'City launches an annual student reading challenge', body: 'The education department invites students to read more books.', published_at: dateISO }, [], today), false);
});

test('extractArticle reads library-source dates, headings, and article text without main/article wrappers', () => {
  const alexandria = extractArticle(`<html><head><meta property="og:title" content="Bibliotheca Alexandrina opens a new research collection"></head><body><nav>News menu</nav><div><small>Posted on <time datetime="22 Oct 2026">22 Oct 2026</time></small><p>The library opened a new research collection for visitors.</p></div></body></html>`, 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=46369');
  assert.equal(alexandria.published_at, '2026-10-22');
  assert.match(alexandria.body, /research collection/);
  const dar = extractArticle('<html><body><form id="aspnetForm"><nav>Featured News روابط سريعة</nav><div>تاريخ النشر: 2026/09/03</div><h3>افتتاح مكتبة عامة جديدة في الجيزة</h3><p class="content">افتتحت الهيئة العامة لدار الكتب مكتبة عامة جديدة للجمهور.</p></form></body></html>', 'https://www.darelkotob.gov.eg/ar-eg/Pages/news-details.aspx?nid=286');
  assert.equal(dar.title, 'افتتاح مكتبة عامة جديدة في الجيزة');
  assert.equal(dar.published_at, '2026-09-03');
  assert.match(dar.body, /مكتبة عامة جديدة للجمهور/);
  const eifl = extractArticle('<html><head><title>EIFL Public Library Innovation Award | EIFL</title></head><body><h2>Search form</h2><h2>Recent news</h2><p>Posted: September 25, 2026</p><p>Public libraries run community AI literacy programmes.</p></body></html>', 'https://www.eifl.net/news/public-library-innovation-award');
  assert.equal(eifl.published_at, '2026-09-25');
  assert.match(eifl.title, /Public Library Innovation Award/);
});

test('candidateOk rejects invalid calendar date without throwing', () => {
  const a = extractArticle(html('https://www.ifla.org/news/bad', 'School libraries', '2026-02-30'), 'https://www.ifla.org/news/bad');
  assert.equal(a.published_at, '2026-02-30');
  assert.equal(candidateOk(a, [], today), false);
 });

const geminiMock = (...texts) => { let i = 0; return async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: texts[Math.min(i++, texts.length - 1)] }] } }] }) }); };
const validSummary = body => JSON.stringify({ title_ar: 'مبادرة جديدة في مكتبة عامة', summary_ar: 'هذا ملخص عربي موثق للمادة المنشورة عن المكتبات ويعرض الخبر بإيجاز دون نسخ النص الكامل أو إضافة ادعاءات غير موجودة.', relevance: true, claims: [{ ar: 'مبادرة مكتبة', quote: body.slice(0, 38) }] });

test('summary rejects empty claims and nonliteral quotes', async () => {
  const a = { published_at: dateISO, body: 'School library services improved for students and school librarians with practical guidance and resources.' };
  const empty = JSON.stringify({ title_ar: 'عنوان عربي طويل مناسب للأخبار المدرسية', summary_ar: 'هذا ملخص عربي موثق للمادة المنشورة ويعرض الخبر بإيجاز دون نسخ النص الكامل أو إضافة ادعاءات غير موجودة.', relevance: true, claims: [] });
  await assert.rejects(() => generateArabicSummary(a, 'k', geminiMock(empty)), /summary/);
  const nonliteral = JSON.stringify({ title_ar: 'عنوان عربي طويل مناسب للأخبار المدرسية', summary_ar: 'هذا ملخص عربي موثق للمادة المنشورة ويعرض الخبر بإيجاز دون نسخ النص الكامل أو إضافة ادعاءات غير موجودة.', relevance: true, claims: [{ ar: 'نص', quote: 'School library services improved for students and librarians' }] });
  await assert.rejects(() => generateArabicSummary(a, 'k', geminiMock(nonliteral)), /summary/);
 });

test('processNews uses per-source six article budget and still discovers the ALA news page', async () => {
  const original = [..._internal.DISCOVERY];
  try {
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, 'https://www.ifla.org/news/', 'https://www.ala.org/news');
    const iflaLinks = Array.from({ length: 7 }, (_, i) => `<a href="https://www.ifla.org/news/old-${i}">old</a>`).join('');
    let alaArticleFetched = false;
    const fetcher = async url => {
      if (url === 'https://www.ifla.org/news/') return response(`<main>${iflaLinks}</main>`);
      if (url === 'https://www.ala.org/news') return response('<a href="https://www.ala.org/news/today">today</a>');
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
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, 'https://www.ala.org/news');
    const releaseDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const sourceBody = `For immediate release | ${releaseDate}. Public libraries launch community reading and digital literacy services for local residents.`;
    const articleUrl = 'https://www.ala.org/news/release';
    const first = validSummary(sourceBody);
    const verify = JSON.stringify({ faithful: true, directly_library_related: true, dates_match: true, no_unsupported_claims: true });
    // The first Gemini response is the exact-quote summary and the second is the verifier.
    let generation = 0;
    const mockedResult = await processNews({ schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] }, { fetcher: async (url, opts) => {
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: generation++ ? verify : first }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      return url === _internal.DISCOVERY[0] ? response(`<a href="${articleUrl}">release</a>`) : response(`<meta property="og:title" content="Public library reading services"><main>${sourceBody}</main>`);
    }, geminiKey: 'k' });
    assert.equal(mockedResult.items.length, 1);
    const item = validateResponse(mockedResult, today).items[0];
    assert.equal(item.id, itemId(articleUrl));
    assert.equal(item.scope, 'libraries');
    assert.equal(item.category, 'أخبار المكتبات');
    assert.equal(Object.hasOwn(item, 'image_url'), false);
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });

test('processNews discovers and summarizes an official Egyptian library article in Arabic', async () => {
  const listingUrl = 'https://www.darelkotob.gov.eg/ar-eg/Pages/News.aspx';
  const articleUrl = 'https://www.darelkotob.gov.eg/ar-eg/Pages/news-details.aspx?nid=286';
  const original = [..._internal.DISCOVERY];
  const sourceBody = 'افتتحت الهيئة العامة لدار الكتب مكتبة عامة جديدة للجمهور، وتضم قاعات للقراءة ومصادر معرفية متنوعة.';
  const summary = JSON.stringify({ title_ar: 'دار الكتب تفتتح مكتبة عامة جديدة', summary_ar: 'افتتحت دار الكتب مكتبة عامة جديدة للجمهور، وتضم قاعات للقراءة ومصادر معرفية متنوعة.', relevance: true, claims: [{ ar: 'افتتاح مكتبة عامة', quote: sourceBody.slice(0, 38) }] });
  const verify = JSON.stringify({ faithful: true, directly_library_related: true, dates_match: true, no_unsupported_claims: true });
  let generation = 0;
  try {
    const fetcher = async url => {
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: generation++ ? verify : summary }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === listingUrl) return response(`<a href="${articleUrl}">افتتاح مكتبة عامة</a>`);
      if (url === articleUrl) return response(`<html><body><h3>افتتاح مكتبة عامة جديدة في الجيزة</h3><p>تاريخ الخبر: ${dateISO.replaceAll('-', '/')}</p><p>${sourceBody}</p></body></html>`);
      return response('<html></html>');
    };
    const result = await processNews({ schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] }, { fetcher, geminiKey: 'k' });
    assert.equal(result.items.length, 1);
    const item = validateResponse(result, today).items[0];
    assert.equal(item.scope, 'libraries');
    assert.equal(item.source_name, 'الهيئة العامة لدار الكتب والوثائق القومية');
    assert.equal(item.published_at, dateISO);
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });

test('processNews resolves Bibliotheca Alexandrina article links relative to the listing slash', async () => {
  const listingUrl = 'https://www.bibalex.org/en/news/';
  const articleUrl = 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=46369';
  const intermediateArticleUrl = 'https://www.bibalex.org/news/Details?DocumentID=46369';
  const canonicalArticleUrl = 'https://www.bibalex.org/en/news/details?documentid=46369';
  const original = [..._internal.DISCOVERY];
  const sourceBody = 'The Bibliotheca Alexandrina opened a new research library collection for university visitors and scholars.';
  const summary = validSummary(sourceBody);
  const verify = JSON.stringify({ faithful: true, directly_library_related: true, dates_match: true, no_unsupported_claims: true });
  let generation = 0;
  try {
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, listingUrl);
    const fetcher = async url => {
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: generation++ ? verify : summary }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === listingUrl) return response('<a href="Details.aspx?DocumentID=46369&amp;">Research library collection</a>');
      if (url === articleUrl) return new Response('', { status: 301, headers: { location: '/news/Details?DocumentID=46369&' } });
      if (url.startsWith(intermediateArticleUrl)) return new Response('', { status: 302, headers: { location: 'https://www.bibalex.org/en/news/details?documentid=46369&' } });
      if (url.startsWith(canonicalArticleUrl)) return response(`<html><head><meta property="og:title" content="Bibliotheca Alexandrina opens a research library collection"></head><body><time datetime="${dateISO}"></time><main>${sourceBody}</main></body></html>`);
      return response('<html></html>');
    };
    const result = await processNews({ schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] }, { fetcher, geminiKey: 'k' });
    assert.equal(result.items.length, 1);
    const item = validateResponse(result, today).items[0];
    assert.equal(item.source_url, canonicalArticleUrl);
    assert.equal(item.source_name, 'مكتبة الإسكندرية');
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });

test('processNews returns no news when all sources fail or verification is invalid', async () => {
  const original = [..._internal.DISCOVERY];
  try {
    _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, 'https://www.ifla.org/news/', 'https://www.ala.org/news');
    const payload = { schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: '1', run_attempt: '1', timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), mode: 'collect', known_urls: [] };
    const failed = await processNews(payload, { fetcher: async () => { throw new Error('down'); }, geminiKey: 'k' });
    assert.equal(failed.items.length, 0); assert.equal(failed.rejected_count, 2);
    const body = 'School library services improved for students and school librarians with practical guidance and resources.';
    const invalid = await processNews({ ...payload, nonce: crypto.randomUUID() }, { fetcher: async url => url === _internal.DISCOVERY[0] ? response('<a href="https://www.ifla.org/news/a">a</a>') : response(`<main>${body}</main>`), geminiKey: 'k' });
    assert.equal(invalid.items.length, 0);
  } finally { _internal.DISCOVERY.splice(0, _internal.DISCOVERY.length, ...original); }
 });
