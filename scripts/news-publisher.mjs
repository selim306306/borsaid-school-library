import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const ENDPOINT = 'https://eahptkwvjcnixlzlyznh.supabase.co/functions/v1/school-library-news';
export const MAX_ITEMS = 3;
const DAY = 86400000;
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid)$/i;
const BIDI_OR_HTML = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

export function canonicalUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/u.test(value)) throw new Error('invalid_url');
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('invalid_url');
  if (/%(?:2f|5c)/iu.test(u.pathname)) throw new Error('invalid_url');
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.href;
}

function sourceAllowed(url) {
  const u = new URL(url);
  if (u.hostname === 'www.ifla.org') return u.pathname.startsWith('/news/') && u.pathname !== '/news/';
  if (u.hostname === 'www.ala.org') return u.pathname.startsWith('/news/') && u.pathname !== '/news/';
  if (u.hostname === 'www.unesco.org') return (/^\/(?:en|ar)\/articles\//u).test(u.pathname) && u.pathname.length > 14;
  if (u.hostname === 'www.bibalex.org') { const params = [...u.searchParams.entries()]; return ['/en/news/details.aspx', '/news/details', '/en/news/details'].includes(u.pathname.toLowerCase()) && params.length === 1 && params[0][0].toLowerCase() === 'documentid' && /^\d+$/u.test(params[0][1]); }
  if (u.hostname === 'www.darelkotob.gov.eg') { const params = [...u.searchParams.entries()]; return u.pathname.toLowerCase() === '/ar-eg/pages/news-details.aspx' && params.length === 1 && params[0][0].toLowerCase() === 'nid' && /^\d+$/u.test(params[0][1]); }
  if (u.hostname === 'www.eifl.net') return /^\/news\/[a-z0-9][a-z0-9-]*$/iu.test(u.pathname);
  if (u.hostname === 'knowledgequest.aasl.org') return u.pathname.startsWith('/') && u.pathname !== '/';
  return false;
}

function text(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !BIDI_OR_HTML.test(value);
}

function arabicFraction(value) {
  const letters = [...value].filter(ch => /\p{L}/u.test(ch));
  return letters.length > 0 && letters.filter(ch => /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(ch)).length / letters.length >= 0.5;
}

function wordCount(value) { return value.trim().split(/\s+/u).filter(Boolean).length; }

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error('invalid_date');
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error('invalid_date');
  return value;
}

export function itemId(sourceUrl) {
  return `auto-${createHash('sha256').update(sourceUrl).digest('hex')}`;
}

export function validateNewsItem(candidate, now = new Date()) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('invalid_item');
  const source_url = canonicalUrl(candidate.source_url);
  if (!sourceAllowed(source_url)) throw new Error('untrusted_source');
  const published_at = dateOnly(candidate.published_at);
  const today = new Date(now);
  if (!Number.isFinite(today.getTime())) throw new Error('invalid_clock');
  const todayText = today.toISOString().slice(0, 10);
  const cutoff = new Date(today.getTime() - 30 * DAY).toISOString().slice(0, 10);
  if (published_at > todayText || published_at < cutoff) throw new Error('date_out_of_range');
  if (candidate.scope !== 'libraries') throw new Error('invalid_scope');
  if (!text(candidate.title_ar, 15, 200) || !text(candidate.summary_ar, 60, 700) || !arabicFraction(candidate.title_ar) || !arabicFraction(candidate.summary_ar) || wordCount(candidate.summary_ar) > 80) throw new Error('invalid_text');
  if (typeof candidate.source_name !== 'string' || !text(candidate.source_name, 2, 120) || BIDI_OR_HTML.test(candidate.source_name)) throw new Error('invalid_source_name');
  if (!['en', 'ar'].includes(candidate.source_language)) throw new Error('invalid_language');
  if (typeof candidate.category !== 'string' || !text(candidate.category, 2, 80) || BIDI_OR_HTML.test(candidate.category)) throw new Error('invalid_category');
  if (candidate.id !== undefined && (typeof candidate.id !== 'string' || candidate.id !== itemId(source_url))) throw new Error('invalid_id');
  return {
    id: itemId(source_url), title_ar: candidate.title_ar.trim(), summary_ar: candidate.summary_ar.trim(),
    source_name: candidate.source_name.trim(), source_url, published_at, scope: 'libraries',
    source_language: candidate.source_language, category: candidate.category.trim(),
  };
}

function normalizedText(item) {
  return `${item.title_ar || ''} ${item.summary_ar || ''}`.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

export function validateArchive(archive) {
  if (!archive || typeof archive !== 'object' || Array.isArray(archive) || !Array.isArray(archive.items)) throw new Error('invalid_archive');
  for (const item of archive.items) {
    if (!item || typeof item !== 'object' || typeof item.source_url !== 'string') throw new Error('invalid_archive');
    canonicalUrl(item.source_url);
  }
  return archive;
}

export function mergeArchive(archive, candidates, now = new Date()) {
  validateArchive(archive);
  const ids = new Set(); const urls = new Set(); const texts = new Set();
  for (const old of archive.items) {
    try { urls.add(canonicalUrl(old.source_url)); } catch { throw new Error('invalid_archive'); }
    if (typeof old.id === 'string') ids.add(old.id);
    texts.add(normalizedText(old));
  }
  const added = [];
  for (const raw of candidates) {
    const item = validateNewsItem(raw, now);
    if (ids.has(item.id) || urls.has(item.source_url) || texts.has(normalizedText(item))) continue;
    ids.add(item.id); urls.add(item.source_url); texts.add(normalizedText(item)); added.push(item);
  }
  if (!added.length) return { archive, added, changed: false };
  return { archive: { ...archive, updated_at: new Date(now).toISOString(), items: [...archive.items, ...added] }, added, changed: true };
}

export function verifyTransition(base, candidate, now = new Date()) {
  validateArchive(base); validateArchive(candidate);
  if (candidate.schema_version !== base.schema_version) throw new Error('schema_changed');
  const baseKeys = Object.keys(base).sort(); const candidateKeys = Object.keys(candidate).sort();
  if (!isDeepStrictEqual(baseKeys.filter(k => k !== 'updated_at' && k !== 'items'), candidateKeys.filter(k => k !== 'updated_at' && k !== 'items'))) throw new Error('metadata_changed');
  for (const key of baseKeys) if (key !== 'updated_at' && key !== 'items' && !isDeepStrictEqual(base[key], candidate[key])) throw new Error('metadata_changed');
  if (candidate.items.length < base.items.length) throw new Error('items_deleted');
  for (let i = 0; i < base.items.length; i++) if (!isDeepStrictEqual(base.items[i], candidate.items[i])) throw new Error('item_mutated');
  const added = candidate.items.slice(base.items.length);
  if (added.length > MAX_ITEMS) throw new Error('too_many_items');
  const ids = new Set(); const urls = new Set(); const texts = new Set();
  for (const raw of base.items) {
    if (!raw || typeof raw !== 'object') throw new Error('invalid_archive');
    if (typeof raw.id === 'string') ids.add(raw.id);
    try { urls.add(canonicalUrl(raw.source_url)); } catch { throw new Error('invalid_archive'); }
    texts.add(normalizedText(raw));
  }
  for (const raw of added) {
    const item = validateNewsItem(raw, now);
    if (!isDeepStrictEqual(raw, item)) throw new Error('invalid_item');
    if (ids.has(item.id) || urls.has(item.source_url) || texts.has(normalizedText(item))) throw new Error('duplicate_item');
    ids.add(item.id); urls.add(item.source_url); texts.add(normalizedText(item));
  }
  if (!added.length) { if (!isDeepStrictEqual(base, candidate)) throw new Error('updated_at_changed'); return candidate; }
  const parsed = Date.parse(candidate.updated_at);
  if (!Number.isFinite(parsed) || Math.abs(parsed - new Date(now).getTime()) > 5 * 60 * 1000) throw new Error('invalid_updated_at');
  return candidate;
}

export function buildPayload({ archive, now = new Date(), env = process.env, nonce = randomUUID() }) {
  validateArchive(archive);
  const timestamp = new Date(now).toISOString();
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error('invalid_clock');
  const runId = /^\d+$/u.test(env.GITHUB_RUN_ID || '') ? Number(env.GITHUB_RUN_ID) : 'local-dry-run';
  const runAttempt = /^\d+$/u.test(env.GITHUB_RUN_ATTEMPT || '') ? Number(env.GITHUB_RUN_ATTEMPT) : 1;
  return { schema_version: 1, repository: 'selim306306/borsaid-school-library', repository_id: 1416862821,
    ref: 'refs/heads/main', workflow: '.github/workflows/news-only.yml', run_id: runId, run_attempt: runAttempt,
    timestamp, nonce, mode: 'collect', known_urls: archive.items.map(x => canonicalUrl(x.source_url)) };
}

export function signedHeaders(rawBody, secret, timestamp, nonce) {
  if (typeof secret !== 'string' || !secret) throw new Error('missing_secret');
  const signature = createHmac('sha256', secret).update(`v1\n${timestamp}\n${nonce}\n${rawBody}`).digest('hex');
  return { 'content-type': 'application/json', 'X-News-Timestamp': timestamp, 'X-News-Nonce': nonce, 'X-News-Signature': signature };
}

export function validateResponse(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.schema_version !== 1 || body.status !== 'ok' || !Array.isArray(body.items) || body.items.length > MAX_ITEMS || !Number.isInteger(body.rejected_count) || body.rejected_count < 0) throw new Error('invalid_response');
  const items = body.items.map(item => validateNewsItem(item, now));
  return { items, rejected_count: body.rejected_count };
}

export async function runPublisher({ file = join(dirname(fileURLToPath(import.meta.url)), '..', 'news.json'), mode = 'dry-run', env = process.env, now = new Date(), request = fetch } = {}) {
  const secret = env.NEWS_HMAC_SECRET;
  if (!secret) throw new Error('missing_secret');
  const archive = JSON.parse(await readFile(file, 'utf8'));
  const payload = buildPayload({ archive, now, env });
  const rawBody = JSON.stringify(payload);
  const headers = signedHeaders(rawBody, secret, payload.timestamp, payload.nonce);
  const response = await request(ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(150000), headers, body: rawBody });
  if (!response || !response.ok) throw new Error('endpoint_failure');
  let body;
  try {
    let raw;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 40000) throw new Error('response_too_large'); chunks.push(value); }
      raw = Buffer.concat(chunks).toString('utf8');
    } else if (typeof response.text === 'function') { raw = await response.text(); if (Buffer.byteLength(raw) > 40000) throw new Error('response_too_large'); }
    else { body = await response.json(); raw = JSON.stringify(body); if (Buffer.byteLength(raw) > 40000) throw new Error('response_too_large'); }
    if (body === undefined) body = JSON.parse(raw);
  } catch (error) { if (error?.message === 'response_too_large') throw error; throw new Error('invalid_response'); }
  const result = validateResponse(body, now);
  const merged = mergeArchive(archive, result.items, now);
  if (mode === 'write' && merged.changed) {
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(merged.archive, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, file);
  }
  const diagnostics = {};
  for (const key of ['articles_fetched', 'eligible', 'generated', 'verified', 'source_failed', 'summary_failed', 'verifier_failed']) {
    const value = body.diagnostics?.[key];
    if (Number.isInteger(value) && value >= 0 && value <= 100) diagnostics[key] = value;
  }
  return { mode, received: result.items.length, rejected_count: result.rejected_count, added: merged.added.length, written: mode === 'write' && merged.changed, diagnostics };
}

async function main() {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--verify-transition' && args.length === 3) {
      const base = JSON.parse(await readFile(args[1], 'utf8')); const candidate = JSON.parse(await readFile(args[2], 'utf8'));
      verifyTransition(base, candidate); console.log(JSON.stringify({ valid: true })); return;
    }
    if (args.length > 1 || (args.length === 1 && args[0] !== '--write')) throw new Error('invalid_args');
    const result = await runPublisher({ mode: args[0] === '--write' ? 'write' : 'dry-run' }); console.log(JSON.stringify(result));
  } catch { console.error('news publisher failed'); process.exitCode = 1; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
