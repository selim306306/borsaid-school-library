import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { syncMediaBootstrap, updateIndex, validateSignedUrl, validateStoragePath } from '../scripts/sync-media-bootstrap.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const ids = { header: '54f7ade2-cde8-4575-b38e-ad5561e79b4c', newer: '64f7ade2-cde8-4575-b38e-ad5561e79b4c', logo: 'db7748cc-05f3-4ee3-b280-ce8ada32135d' };
const paths = { 'header-feature-image': `media/header-feature-image/${ids.header}.jpg`, 'site-mark': `media/site-mark/${ids.logo}.png` };
const rootFixture = () => { const root = mkdtempSync(join(tmpdir(), 'media-bootstrap-')); mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'index.html'), '<link rel="preload" as="image" href="assets/egypt.mark+old.webp" fetchpriority="high"><link rel="preload" as="image" href="assets/header-photo-initial.webp" fetchpriority="high"><img id="brandDefaultLogo" src="assets/egypt.mark+old.webp" data-site-media-bootstrap-src="assets/egypt.mark+old.webp" alt="old logo"><img data-site-media-key="header-feature-image" src="assets/header-photo-initial.webp" data-site-media-bootstrap-src="assets/header-photo-initial.webp" alt="old banner">'); return root; };
const response = (body, headers = {}, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: key => headers[key.toLowerCase()] || null }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => body });
function mockFetch({ changed = false, missingAsset = false, alwaysChange = false, unpublished = false } = {}) {
  let reads = 0;
  return async (url, init = {}) => {
    assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    if (url.includes('/rest/v1/site_media_slots')) {
      reads++; const newer = alwaysChange ? reads % 2 === 0 : changed && reads >= 2; const id = newer ? ids.newer : ids.header;
      return response([{ media_key: 'header-feature-image', current_asset_id: id, is_published: !unpublished, updated_at: newer ? '2' : '1' }, { media_key: 'site-mark', current_asset_id: ids.logo, is_published: true, updated_at: '1' }]);
    }
    if (url.includes('/rest/v1/site_media_assets')) return response(missingAsset ? [{ id: ids.logo, media_key: 'site-mark', storage_path: paths['site-mark'], alt_text: 'شعار', mime_type: 'image/png', byte_size: png.length }] : [{ id: ids.header, media_key: 'header-feature-image', storage_path: paths['header-feature-image'], alt_text: 'قديم', mime_type: 'image/png', byte_size: png.length }, { id: ids.newer, media_key: 'header-feature-image', storage_path: paths['header-feature-image'], alt_text: 'حديث', mime_type: 'image/png', byte_size: png.length }, { id: ids.logo, media_key: 'site-mark', storage_path: paths['site-mark'], alt_text: 'شعار', mime_type: 'image/png', byte_size: png.length }]);
    if (url.includes('/storage/v1/object/sign/site-media') && init.method === 'POST') { const requested = JSON.parse(init.body).paths[0]; return response([{ signedURL: `/object/sign/site-media/${requested}?token=test` }]); }
    if (url.includes('/storage/v1/object/sign/site-media/')) return response(png, { 'content-type': 'image/png', 'content-length': String(png.length) });
    throw new Error(`unexpected URL ${url}`);
  };
}

test('validates exact paths and rejects prefix, suffix, fragment, and extra query', () => {
  const path = paths['site-mark'];
  assert.equal(validateStoragePath(path, 'site-mark').startsWith('media/'), true);
  assert.match(validateSignedUrl(`/object/sign/site-media/${path}?token=x`, path), /^https:\/\/eahptkwvjcnixlzlyznh\.supabase\.co/);
  assert.throws(() => validateStoragePath('media/site-mark/x.png', 'site-mark'));
  assert.throws(() => validateSignedUrl(`https://eahptkwvjcnixlzlyznh.supabase.co/storage/v1/object/sign/site-media-extra/${path}?token=x`, path));
  assert.throws(() => validateSignedUrl(`https://eahptkwvjcnixlzlyznh.supabase.co/storage/v1/object/sign/site-media/${path}/extra?token=x`, path));
  assert.throws(() => validateSignedUrl(`https://eahptkwvjcnixlzlyznh.supabase.co/storage/v1/object/sign/site-media/${path}?token=x&foo=y`, path));
  assert.throws(() => validateSignedUrl(`https://eahptkwvjcnixlzlyznh.supabase.co/storage/v1/object/sign/site-media/${path}?token=x#fragment`, path));
  assert.throws(() => validateSignedUrl(`http://eahptkwvjcnixlzlyznh.supabase.co/storage/v1/object/sign/site-media/${path}?token=x`, path));
});

test('generated page keeps a neutral site mark while a replaced image is fetched', () => {
  const root = rootFixture();
  try {
    updateIndex(root, {}, {
      'site-mark': { src: 'assets/site-mark-initial-deadbeefdeadbeef.webp', path: 'media/site-mark/db7748cc-05f3-4ee3-b280-ce8ada32135d.png', alt: 'old flag' },
      'header-feature-image': { src: 'assets/header-feature-image-initial-1111111111111111.webp', path: 'media/header-feature-image/54f7ade2-cde8-4575-b38e-ad5561e79b4c.jpg', alt: 'current banner' },
    });
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const logo = html.match(/<img\b[^>]*\bid="brandDefaultLogo"[^>]*>/i)?.[0];
    assert.ok(logo, 'primary site mark remains in the page');
    assert.match(logo, /\bsrc="assets\/mark\.svg"/);
    assert.match(logo, /\balt=""/);
    assert.doesNotMatch(logo, /data-site-media-bootstrap-(?:src|path)/);
    assert.doesNotMatch(html, /<link\b[^>]*\bhref="assets\/site-mark-initial-[^"]+"/i);
    assert.match(html, /<link\b[^>]*\bhref="assets\/header-feature-image-initial-1111111111111111\.webp"/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stable state converts real PNG with requested dimensions/quality and hashes output bytes', async () => {
  const root = rootFixture();
  try {
    const old = join(root, 'assets/site-mark-initial-deadbeefdeadbeef.webp'); writeFileSync(old, 'retain me');
    const result = await syncMediaBootstrap({ root, fetchImpl: mockFetch() });
    assert.equal(result.attempt, 1);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /href="assets\/header-feature-image-initial-[0-9a-f]{16}\.webp"/);
    assert.doesNotMatch(html, /href="assets\/site-mark-initial-[^"]+"/);
    assert.match(html, /<img id="brandDefaultLogo" src="assets\/mark\.svg" alt="">/);
    assert.match(html, /data-site-media-key="header-feature-image"[^>]*data-site-media-bootstrap-path="media\/header/);
    assert.equal(existsSync(old), true);
    for (const key of ['header-feature-image', 'site-mark']) {
      const output = result.outputs[key]; const bytes = readFileSync(join(root, output.src));
      assert.equal(output.hash, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(output.src, `assets/${key}-initial-${output.hash.slice(0, 16)}.webp`);
    }
    assert.equal(readFileSync(join(root, 'assets/media-bootstrap.json'), 'utf8').includes('"supabase"'), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('latest state wins and retries before any index write', async () => { const root = rootFixture(); try { const result = await syncMediaBootstrap({ root, fetchImpl: mockFetch({ changed: true }) }); assert.equal(result.attempt, 2); } finally { rmSync(root, { recursive: true, force: true }); } });
test('partial, unpublished state fails closed without writing index', async () => { const root = rootFixture(); const before = readFileSync(join(root, 'index.html'), 'utf8'); try { await assert.rejects(() => syncMediaBootstrap({ root, fetchImpl: mockFetch({ missingAsset: true }) }), /current asset is missing/); await assert.rejects(() => syncMediaBootstrap({ root, fetchImpl: mockFetch({ unpublished: true }) }), /invalid unpublished/); assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), before); } finally { rmSync(root, { recursive: true, force: true }); } });
test('unstable state exhausts bounded retries and leaves no temp directory', async () => { const root = rootFixture(); try { await assert.rejects(() => syncMediaBootstrap({ root, maxAttempts: 2, fetchImpl: mockFetch({ alwaysChange: true }) }), /changed during bounded sync|exhausted/); } finally { rmSync(root, { recursive: true, force: true }); } });
