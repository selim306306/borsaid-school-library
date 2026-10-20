import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPayload, canonicalUrl, mergeArchive, runPublisher, signedHeaders, validateNewsItem, validateResponse } from './news-publisher.mjs';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const item = (extra = {}) => ({
  title_ar: 'خبر موثوق عن المكتبات المدرسية',
  summary_ar: 'هذا ملخص عربي تجريبي طويل بما يكفي لاجتياز التحقق الصارم للنشر الآمن.',
  source_name: 'مصدر تجريبي موثوق', source_url: 'https://www.ifla.org/news/synthetic-school-library-item/?utm_source=x',
  published_at: '2026-10-10', scope: 'school-library', source_language: 'en', category: 'مكتبات مدرسية', ...extra,
});
const archive = (items = []) => ({ schema_version: 1, updated_at: '2026-10-01T00:00:00+03:00', schedule_interval_hours: 24, schedule_interval_seconds: 86400, items, editorial_scope: 'school-libraries', editorial_policy_ar: 'لا صور.', });
const response = (items = []) => ({ schema_version: 1, status: 'ok', items, rejected_count: 0 });
function fakeRequest(body) { return async (_url, options) => ({ ok: true, async json() { return body; }, options }); }

test('dry-run is the default and does not write a no-op archive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-publisher-')); const file = join(dir, 'news.json');
  const original = JSON.stringify(archive([item()])); await writeFile(file, original);
  const result = await runPublisher({ file, env: { NEWS_HMAC_SECRET: 'test-secret' }, now: NOW, request: fakeRequest(response([item()])) });
  assert.equal(result.written, false); assert.equal(result.added, 0); assert.equal(await readFile(file, 'utf8'), original);
});

test('write preserves the archive and only appends valid new items', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-publisher-')); const file = join(dir, 'news.json');
  const old = archive(Array.from({ length: 21 }, (_, i) => ({ id: `legacy-${i}`, source_url: `https://www.ifla.org/news/legacy-${i}`, title_ar: 'أرشيف', summary_ar: 'ملخص أرشيفي', published_at: '2026-10-01', scope: 'school-library' })));
  await writeFile(file, JSON.stringify(old));
  const result = await runPublisher({ file, mode: 'write', env: { NEWS_HMAC_SECRET: 'test-secret' }, now: NOW, request: fakeRequest(response([item({ source_url: 'https://www.ala.org/news/new-item' })])) });
  const saved = JSON.parse(await readFile(file, 'utf8')); assert.equal(result.written, true); assert.equal(saved.items.length, 22); assert.equal(saved.items[0].id, 'legacy-0'); assert.equal(saved.updated_at, NOW.toISOString());
});

test('duplicate URL, tracking aliases, and normalized text are deduplicated', () => {
  const old = archive([{ id: 'old', source_url: 'https://www.ifla.org/news/x?utm_medium=email' }, { id: 'old2', source_url: 'https://www.ifla.org/news/y', title_ar: 'عنوان متشابه', summary_ar: 'ملخص متشابه' }]);
  assert.equal(mergeArchive(old, [item({ source_url: 'https://www.ifla.org/news/x?fbclid=1' })], NOW).added.length, 0);
  assert.equal(mergeArchive(archive([]), [item(), item({ source_url: 'https://www.ifla.org/news/other', title_ar: item().title_ar.toUpperCase(), summary_ar: item().summary_ar })], NOW).added.length, 1);
  assert.equal(old.items.length, 2);
});

test('endpoint failure and malformed response never write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-publisher-')); const file = join(dir, 'news.json'); const original = JSON.stringify(archive()); await writeFile(file, original);
  await assert.rejects(runPublisher({ file, mode: 'write', env: { NEWS_HMAC_SECRET: 's' }, now: NOW, request: async () => ({ ok: false }) }), /endpoint_failure/);
  await assert.rejects(runPublisher({ file, mode: 'write', env: { NEWS_HMAC_SECRET: 's' }, now: NOW, request: fakeRequest({ schema_version: 1, status: 'ok', items: [item({ summary_ar: '<script>x</script>' })], rejected_count: 0 }) }), /invalid_text/);
  assert.equal(await readFile(file, 'utf8'), original);
});

test('strict source allowlist, dates, injection, and item fields', () => {
  for (const source_url of ['https://evil.example/news/x', 'https://www.ifla.org/books/x', 'https://www.ala.org/news', 'javascript:alert(1)']) assert.throws(() => validateNewsItem(item({ source_url }), NOW));
  for (const published_at of ['2026-10', '2026-02-30', '2026-10-21', '2026-08-01', '2026-10-10T00:00:00Z']) assert.throws(() => validateNewsItem(item({ published_at }), NOW));
  assert.throws(() => validateNewsItem(item({ title_ar: `عنوان${String.fromCharCode(0)} غير آمن` }), NOW));
  assert.throws(() => validateNewsItem(item({ summary_ar: 'قصير' }), NOW));
  const clean = validateNewsItem(item(), NOW); assert.equal(Object.hasOwn(clean, 'image_url'), false); assert.match(clean.id, /^auto-[a-f0-9]{64}$/);
});

test('response rejects over-limit and unknown/incomplete shapes; unknown item keys are discarded', () => {
  assert.throws(() => validateResponse({ schema_version: 1, status: 'ok', items: [item(), item(), item(), item()], rejected_count: 0 }, NOW));
  const result = validateResponse(response([item({ image_url: 'https://evil.test/x', secret: 'do-not-copy' })]), NOW);
  assert.equal(result.items[0].image_url, undefined); assert.equal(result.items[0].secret, undefined);
  assert.throws(() => validateResponse({ schema_version: 1, status: 'ok', items: [], rejected_count: -1 }, NOW));
});

test('HMAC signs exact protocol and payload has fixed provenance', () => {
  const payload = buildPayload({ archive: archive([{ source_url: 'https://www.ifla.org/news/x' }]), now: NOW, env: { GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' }, nonce: 'nonce' });
  assert.deepEqual({ repository: payload.repository, repository_id: payload.repository_id, ref: payload.ref, workflow: payload.workflow, mode: payload.mode, run_id: payload.run_id, run_attempt: payload.run_attempt }, { repository: 'selim306306/borsaid-school-library', repository_id: 1416862821, ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', mode: 'collect', run_id: 42, run_attempt: 2 });
  const raw = JSON.stringify(payload); const h = signedHeaders(raw, 'secret', payload.timestamp, payload.nonce); assert.match(h['X-News-Signature'], /^[a-f0-9]{64}$/); assert.equal(h['X-News-Timestamp'], payload.timestamp); assert.equal(canonicalUrl('https://www.ifla.org/news/x?b=2&utm_source=x&a=1#frag'), 'https://www.ifla.org/news/x?a=1&b=2');
});

import { verifyTransition, itemId } from './news-publisher.mjs';

test('rejects scope, fabricated IDs, non-Arabic text, oversized summaries and encoded paths', () => {
  for (const extra of [
    { scope: 'education' }, { id: 'forged' },
    { title_ar: 'A long English title about school libraries' },
    { summary_ar: 'English school library news '.repeat(4) },
    { summary_ar: 'مدرسة '.repeat(81) },
    { source_url: 'https://www.ifla.org/news/school%2flibrary' },
    { source_url: 'https://knowledgequest.aasl.org/' },
  ]) assert.throws(() => validateNewsItem(item(extra), NOW));
  const good = validateNewsItem(item(), NOW);
  assert.equal(good.id, itemId(good.source_url));
});

test('append-only transition preserves every prior item and root metadata', () => {
  const base = archive([{ id: 'old', source_url: 'https://old.example/original', arbitrary: { private: false }, date_precision: 'month' }]);
  const candidate = mergeArchive(base, [item()], NOW).archive;
  assert.deepEqual(verifyTransition(base, candidate, NOW), candidate);
  for (const tamper of [
    c => c.items.shift(), c => c.items.reverse(), c => { c.items[0].id = 'mutated'; },
    c => { c.items[0].arbitrary.private = true; }, c => { c.schema_version = 2; },
    c => { c.schedule_interval_hours = 1; }, c => { c.unapproved_metadata = 'value'; },
    c => { delete c.editorial_policy_ar; }, c => { c.updated_at = '2020-01-01'; },
    c => { c.items[1].image_url = 'https://example.test/image.jpg'; },
    c => { c.items.push({ ...c.items[1] }); },
  ]) {
    const changed = structuredClone(candidate); tamper(changed);
    assert.throws(() => verifyTransition(base, changed, NOW));
  }
});

test('no-op transition cannot update timestamps, delete metadata, or reorder items', () => {
  const base = archive([{ id: 'old', source_url: 'https://old.example/old' }]);
  assert.deepEqual(verifyTransition(base, structuredClone(base), NOW), base);
  const changed = structuredClone(base); changed.updated_at = NOW.toISOString();
  assert.throws(() => verifyTransition(base, changed, NOW), /updated_at_changed/);
});

test('response overflow and redirect failure never alter the archive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'news-publisher-')); const file = join(dir, 'news.json');
  const original = JSON.stringify(archive()); await writeFile(file, original);
  await assert.rejects(runPublisher({ file, mode: 'write', env: { NEWS_HMAC_SECRET: 's' }, now: NOW,
    request: async (_u, options) => { assert.equal(options.redirect, 'error'); assert.ok(options.signal); return new Response('x'.repeat(40001)); },
  }), /response_too_large/);
  assert.equal(await readFile(file, 'utf8'), original);
});
