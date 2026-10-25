#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SITE_MEDIA_BUCKET } from '../site-media-config.js';

export const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';
export const MEDIA_KEYS = Object.freeze(['header-feature-image', 'site-mark']);
const PROJECT_HOST = new URL(SUPABASE_URL).host;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATH_RE = /^media\/(header-feature-image|site-mark)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|webp)$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 4096;
const MAX_PIXELS = 16_000_000;
const RASTER_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULTS = {
  'header-feature-image': { src: 'assets/header-photo-placeholder.svg', alt: 'صورة نشاط مكتبي في مكتبة مدرسية', width: 480, height: 360, quality: 78 },
  'site-mark': { src: 'assets/mark.svg', alt: 'شعار المكتبة المدرسية الرقمية', width: 144, height: 144, quality: 80 },
};

const timeoutSignal = () => AbortSignal.timeout(15000);
const json = async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); };
export async function supabaseFetch(url, init = {}, fetchImpl = globalThis.fetch) {
  if (!fetchImpl) throw new Error('fetch is unavailable');
  return fetchImpl(url, { redirect: 'error', ...init, signal: timeoutSignal(), headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, ...(init.headers || {}) } });
}
function apiUrl(table, query) { return `${SUPABASE_URL}/rest/v1/${table}?${new URLSearchParams(query)}`; }
export async function fetchState(fetchImpl = globalThis.fetch) {
  const slots = await json(await supabaseFetch(apiUrl('site_media_slots', { select: 'media_key,current_asset_id,is_published,updated_at', media_key: 'in.(header-feature-image,site-mark)', limit: '2' }), {}, fetchImpl));
  const ids = slots.filter(s => MEDIA_KEYS.includes(s.media_key) && s.current_asset_id).map(s => s.current_asset_id);
  const assets = ids.length ? await json(await supabaseFetch(apiUrl('site_media_assets', { select: 'id,media_key,storage_path,alt_text,mime_type,byte_size', id: `in.(${ids.join(',')})`, limit: String(ids.length) }), {}, fetchImpl)) : [];
  return { slots, assets };
}
export function snapshot(state) {
  return JSON.stringify({
    slots: state.slots.map(({ media_key, current_asset_id, is_published, updated_at }) => ({ media_key, current_asset_id, is_published, updated_at })).sort((a, b) => a.media_key.localeCompare(b.media_key)),
    assets: state.assets.map(({ id, media_key, storage_path, alt_text, mime_type, byte_size }) => ({ id, media_key, storage_path, alt_text, mime_type, byte_size })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export function validateStoragePath(path, key) {
  if (typeof path !== 'string' || !PATH_RE.test(path) || !path.startsWith(`media/${key}/`)) throw new Error(`invalid storage path for ${key}`);
  return path;
}
export function validateSignedUrl(value, path) {
  if (typeof value !== 'string') throw new Error('missing signed URL');
  const candidate = value.startsWith('/') ? new URL(value.startsWith('/storage/v1/') ? `${SUPABASE_URL}${value}` : `${SUPABASE_URL}/storage/v1${value}`) : new URL(value);
  const expectedBase = `/storage/v1/object/sign/${SITE_MEDIA_BUCKET}/`;
  const expectedRender = `/storage/v1/render/image/sign/${SITE_MEDIA_BUCKET}/`;
  let decodedPath;
  try { decodedPath = decodeURIComponent(candidate.pathname); } catch { throw new Error('signed URL path mismatch'); }
  if (candidate.protocol !== 'https:' || candidate.hostname !== PROJECT_HOST || candidate.port || candidate.username || candidate.password || ![`${expectedBase}${path}`, `${expectedRender}${path}`].includes(decodedPath)) throw new Error('signed URL is not an allowed Supabase URL');
  if (candidate.hash || [...candidate.searchParams.keys()].some(key => key !== 'token') || !candidate.searchParams.has('token')) throw new Error('signed URL query is not allowed');
  return candidate.href;
}
async function bytesOf(response) {
  const type = (response.headers?.get?.('content-type') || '').split(';')[0].toLowerCase();
  if (!RASTER_MIMES.has(type)) throw new Error(`unsupported raster MIME ${type}`);
  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (declared > MAX_BYTES) throw new Error('image exceeds 5 MiB');
  let data;
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let total = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_BYTES) { await reader.cancel?.(); throw new Error('image exceeds 5 MiB'); } chunks.push(value); }
    data = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  } else data = new Uint8Array(await response.arrayBuffer());
  if (!data.length || data.length > MAX_BYTES) throw new Error('image exceeds 5 MiB');
  return { data, mime: type };
}
export async function downloadAndValidate(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { redirect: 'error', signal: timeoutSignal() });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  return bytesOf(response);
}
function runPillow(input, output, width, height, quality, spawnImpl = spawnSync) {
  const code = `from PIL import Image, ImageOps\nimport sys\nim=Image.open(sys.argv[1])\nif im.format not in ('PNG','JPEG','WEBP'): raise SystemExit('invalid raster format')\nim=ImageOps.exif_transpose(im)\nif im.width>${MAX_SIDE} or im.height>${MAX_SIDE} or im.width*im.height>${MAX_PIXELS}: raise SystemExit('dimensions exceed limit')\nim.thumbnail((int(sys.argv[3]),int(sys.argv[4])), Image.Resampling.LANCZOS)\nbg=Image.new('RGBA',(int(sys.argv[3]),int(sys.argv[4])),(255,255,255,255))\nbg.alpha_composite(im.convert('RGBA'),((bg.width-im.width)//2,(bg.height-im.height)//2))\nbg.convert('RGB').save(sys.argv[2],format='WEBP',quality=int(sys.argv[5]),method=6)`;
  const result = spawnImpl('python3', ['-c', code, input, output, String(width), String(height), String(quality)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Pillow conversion failed');
}
export function convertToWebp(data, target, width, height, quality = 80, spawnImpl = spawnSync) {
  if (typeof quality === 'function') { spawnImpl = quality; quality = 80; }
  const dir = resolve(dirname(target), '.media-bootstrap-tmp'); mkdirSync(dir, { recursive: true });
  const input = join(dir, `input-${process.pid}-${Date.now()}.bin`); writeFileSync(input, data);
  try { runPillow(input, target, width, height, quality, spawnImpl); } finally { rmSync(input, { force: true }); }
}
function esc(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function replaceImage(html, selector, output, fallback, { bootstrap = true } = {}) {
  const re = new RegExp(`(<img\\b[^>]*${selector}[^>]*>)`, 'i');
  return html.replace(re, tag => tag.replace(/\s(?:src|data-site-media-bootstrap-src|data-site-media-bootstrap-path|alt)="[^"]*"/gi, '').replace(/>$/, bootstrap
    ? ` src="${esc(output?.src || fallback.src)}" data-site-media-bootstrap-src="${esc(output?.src || fallback.src)}"${output?.path ? ` data-site-media-bootstrap-path="${esc(output.path)}"` : ''} alt="${esc(output?.alt || fallback.alt)}">`
    : ` src="${esc(fallback.src)}" alt="">`));
}
export function updateIndex(root, state, outputs) {
  const file = join(root, 'index.html'); let html = readFileSync(file, 'utf8');
  const oldPreloads = {};
  for (const [key, selector] of [['site-mark', `id=["']brandDefaultLogo["']`], ['header-feature-image', `data-site-media-key=["']header-feature-image["']`]]) {
    const image = html.match(new RegExp(`<img\\b[^>]*${selector}[^>]*>`, 'i'))?.[0];
    oldPreloads[key] = image?.match(/data-site-media-bootstrap-src="([^"]+)"/i)?.[1] || image?.match(/\ssrc="([^"]+)"/i)?.[1];
  }
  html = replaceImage(html, `id=["']brandDefaultLogo["']`, null, DEFAULTS['site-mark'], { bootstrap: false });
  html = replaceImage(html, `data-site-media-key=["']header-feature-image["']`, outputs['header-feature-image'], DEFAULTS['header-feature-image']);
  const oldMarkPreload = oldPreloads['site-mark'];
  if (oldMarkPreload) {
    const escaped = String(oldMarkPreload).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`<link\\b[^>]*href=["']${escaped}["'][^>]*>\\s*`, 'i'), '');
  }
  for (const key of ['header-feature-image']) {
    const next = outputs[key]?.src || DEFAULTS[key].src; const old = oldPreloads[key]; if (!old) continue;
    const escaped = String(old).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<link\\b[^>]*rel=["']preload["'][^>]*as=["']image["'][^>]*href=["'])${escaped}(["'][^>]*>)`, 'i');
    html = html.replace(re, `$1${esc(next)}$2`);
  }
  writeFileSync(file, html);
}
function assertState(state) {
  const byKey = new Map(state.slots.map(s => [s.media_key, s]));
  for (const key of MEDIA_KEYS) {
    const slot = byKey.get(key); if (!slot) throw new Error(`missing media slot: ${key}`);
    if (slot.is_published !== true || !UUID_RE.test(String(slot.current_asset_id || ''))) throw new Error(`invalid unpublished or asset state: ${key}`);
    const asset = state.assets.find(a => a.id === slot.current_asset_id);
    if (!asset) throw new Error(`current asset is missing: ${key}`);
    if (asset.media_key !== key) throw new Error(`asset key mismatch: ${key}`);
    const byteSize = Number(asset.byte_size);
    if (!RASTER_MIMES.has(String(asset.mime_type || '').toLowerCase()) || !Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) throw new Error(`invalid asset metadata: ${key}`);
  }
}
export async function syncMediaBootstrap({ root = resolve(new URL('..', import.meta.url).pathname), fetchImpl = globalThis.fetch, spawnImpl = spawnSync, maxAttempts = 3 } = {}) {
  const tmp = join(root, '.media-bootstrap-tmp'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(root, 'assets'), { recursive: true });
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const before = await fetchState(fetchImpl); assertState(before); const byKey = new Map(before.slots.map(s => [s.media_key, s])); const outputs = {};
      for (const key of MEDIA_KEYS) {
        const slot = byKey.get(key); const asset = before.assets.find(a => a.id === slot.current_asset_id && a.media_key === key);
        const path = validateStoragePath(asset.storage_path, key);
        const signed = await json(await supabaseFetch(`${SUPABASE_URL}/storage/v1/object/sign/${SITE_MEDIA_BUCKET}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths: [path], expiresIn: 3600 }) }, fetchImpl));
        const candidate = signed?.[0]?.signedURL || signed?.[0]?.signedUrl || signed?.signedURL || signed?.signedUrl;
        const image = await downloadAndValidate(validateSignedUrl(candidate, path), fetchImpl);
        const staging = join(tmp, `${key}-initial.webp`); convertToWebp(image.data, staging, DEFAULTS[key].width, DEFAULTS[key].height, DEFAULTS[key].quality, spawnImpl);
        const outputHash = createHash('sha256').update(readFileSync(staging)).digest('hex').slice(0, 16); const filename = `${key}-initial-${outputHash}.webp`;
        outputs[key] = { src: `assets/${filename}`, path, alt: asset.alt_text || DEFAULTS[key].alt, id: asset.id, version: slot.updated_at || null, hash: createHash('sha256').update(readFileSync(staging)).digest('hex'), staging, filename };
      }
      const after = await fetchState(fetchImpl); assertState(after);
      if (snapshot(before) !== snapshot(after)) { if (attempt === maxAttempts) throw new Error('media state changed during bounded sync'); continue; }
      const manifest = Object.fromEntries(MEDIA_KEYS.map(key => [key, { source: 'supabase', path: outputs[key].path, id: outputs[key].id, version: outputs[key].version, hash: outputs[key].hash }]));
      for (const key of MEDIA_KEYS) { const final = join(root, outputs[key].src); renameSync(outputs[key].staging, final); }
      updateIndex(root, after, outputs); writeFileSync(join(root, 'assets', 'media-bootstrap.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      return { attempt, outputs, manifest };
    }
    throw new Error('sync attempts exhausted');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] === new URL(import.meta.url).pathname) syncMediaBootstrap().then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exitCode = 1; });
