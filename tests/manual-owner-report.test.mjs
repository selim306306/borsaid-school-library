import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reportMessages, signPreview, verifyPreview, METRICS } from '../supabase/functions/platform-library-report/delivery.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const deliverySource = fs.readFileSync(path.join(root, 'supabase/functions/platform-library-report/manual-delivery.ts'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'supabase/functions/platform-library-report/index.ts'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function report(libraryCount = 4) {
  const row = n => Object.fromEntries(METRICS.map(([key], i) => [key, n * 100 + i + 1]));
  return {
    generated_at: '2026-01-01T00:00:00.000Z',
    totals: row(9),
    libraries: Array.from({ length: libraryCount }, (_, i) => row(i + 1)),
  };
}

test('reportMessages includes every library and the aggregate without identity/detail fields', () => {
  const messages = reportMessages(report(4), null);
  const text = messages.join('\n');
  assert.match(text, /الإجمالي الكلي/);
  for (let i = 1; i <= 4; i++) assert.match(text, new RegExp(`مكتبة ${i}`));
  for (const [, label] of METRICS) assert.ok(text.includes(label), `missing metric label: ${label}`);
  assert.doesNotMatch(text, /school_name|library_id|user_id|borrower|student|اسم المدرسة|اسم الطالب|تفاصيل الإعارة/i);
  assert.ok(!text.includes('a70f6fa4') && !text.includes('c5d10456'));
});

test('reportMessages splits safely at or below 3500 UTF-16 units without dropping rows', () => {
  const input = report(7);
  const messages = reportMessages(input, {
    summary: 'ملخص '.repeat(2200),
    actions: ['إجراء '.repeat(500), 'تحقق '.repeat(500)],
  });
  assert.ok(messages.length > 1);
  assert.ok(messages.every(message => message.length <= 3500));
  const joined = messages.join('\n');
  for (let i = 1; i <= input.libraries.length; i++) assert.match(joined, new RegExp(`مكتبة ${i}`));
  for (const [key] of METRICS) {
    const label = METRICS.find(([candidate]) => candidate === key)[1];
    assert.ok(joined.includes(label), `missing metric after split: ${key}`);
  }
  // Every numeric row value is retained in the output; this catches dropped chunks.
  for (const row of [input.totals, ...input.libraries]) {
    for (const [key] of METRICS) assert.ok(joined.includes(String(row[key])), `missing value ${row[key]}`);
  }
});

test('preview signatures reject tampering, expiry, wrong user, and missing nonce', async () => {
  const secret = 'test-only-secret';
  const now = 1_700_000_000_000;
  const payload = { user: 'owner-1', expires: now + 600_000, nonce: 'nonce-1', messages: ['محتوى مجمع'] };
  const token = await signPreview(payload, secret);
  assert.deepEqual(await verifyPreview(token, secret, 'owner-1', now), payload);
  const [encoded, signature] = token.split('.');
  const tampered = `${encoded.slice(0, -1)}${encoded.endsWith('A') ? 'B' : 'A'}.${signature}`;
  assert.equal(await verifyPreview(tampered, secret, 'owner-1', now), null);
  assert.equal(await verifyPreview(token, secret, 'other-user', now), null);
  assert.equal(await verifyPreview(token, secret, 'owner-1', now + 600_001), null);
  const noNonce = await signPreview({ ...payload, nonce: undefined }, secret);
  assert.equal(await verifyPreview(noNonce, secret, 'owner-1', now), null);
});

test('send path requires explicit confirmation and validates the signed preview before claiming', () => {
  assert.match(deliverySource, /if \(body\.confirm !== true\) return \{ status: 400, body: \{ error: "confirmation_required" \} \}/);
  assert.match(deliverySource, /const preview = await verifyPreview\(body\.token, secret, user\);/);
  assert.match(deliverySource, /if \(!preview\) return \{ status: 400, body: \{ error: "preview_invalid_or_expired" \} \}/);
  assert.ok(deliverySource.indexOf('body.confirm !== true') < deliverySource.indexOf('fetch(`https://api.telegram.org'));
});

test('backend authorizes platform owners before report actions, claims nonce before fetch, and has no automatic job', () => {
  const auth = indexSource.indexOf('if (membershipError || !memberships?.length)');
  const reportRpc = indexSource.search(/\.rpc\(["']get_platform_library_report["']/);
  const deliveryCall = indexSource.indexOf('manualDelivery(action, body');
  assert.ok(auth >= 0 && reportRpc >= 0 && deliveryCall >= 0 && auth < reportRpc && auth < deliveryCall);
  const claim = deliverySource.indexOf('admin.from("owner_report_deliveries").insert');
  const telegram = deliverySource.indexOf('fetch(`https://api.telegram.org');
  assert.ok(claim >= 0 && claim < telegram, 'delivery claim must precede external fetch');
  assert.match(deliverySource, /code === "23505".*already_attempted/s);
  assert.match(deliverySource, /status: "uncertain"/);
  assert.doesNotMatch(indexSource + deliverySource + appSource, /setInterval\s*\([^)]*platform-library-report|cron|schedule.*platform-library-report|automatic.*send/i);
});

test('frontend preview never sends and the send invoke includes explicit confirm', () => {
  const previewStart = appSource.indexOf("body: { action: 'preview'");
  const sendStart = appSource.indexOf("body: { action: 'send', token, confirm: true }");
  assert.ok(previewStart >= 0 && sendStart > previewStart);
  const previewBlock = appSource.slice(previewStart, sendStart);
  assert.doesNotMatch(previewBlock, /action:\s*['"]send['"]/);
  assert.match(appSource, /body: \{ action: 'send', token, confirm: true \}/);
  assert.match(appSource, /ownerReportPreview = null/);
});
