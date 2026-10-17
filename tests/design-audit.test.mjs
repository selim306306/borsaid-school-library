import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPublicDesign, evaluateDesignSources, PUBLIC_URL } from '../supabase/functions/library-admin-monitor/design-audit.mjs';

const html = '<html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="https://cdn.example.test/no.css"></head><body><main>مكتبة</main></body></html>';
const css = ':root { --ink: #222222; --paper: #ffffff; } body { color: var(--ink); background: var(--paper); font-size: 16px; } :focus-visible { outline: 3px solid #000; } @media (prefers-reduced-motion: reduce) { * { transition: none; } } @media (max-width: 600px) { main { width: 100%; } }';

test('evaluateDesignSources is pure and reports static evidence plus explicit unknowns', () => {
  const first = evaluateDesignSources({ html, css });
  const second = evaluateDesignSources({ html, css });
  assert.deepEqual(first, second);
  assert.equal(first.checks.find((item) => item.id === 'rtl').status, 'pass');
  assert.equal(first.checks.find((item) => item.id === 'viewport').status, 'pass');
  assert.equal(first.checks.find((item) => item.id === 'contrast').status, 'pass');
  assert.equal(first.checks.find((item) => item.id === 'hierarchy').status, 'not_verified');
  assert.equal(first.checks.find((item) => item.id === 'usability').status, 'not_verified');
  assert.match(first.limitation, /ليس مراجعة بصرية/);
});

test('auditPublicDesign fetches only fixed URL and same-origin stylesheets, with stable hash', async () => {
  const calls = [];
  const options = [];
  const fetcher = async (url, init) => {
    calls.push(url);
    options.push(init);
    if (url === PUBLIC_URL) return { ok: true, text: async () => html };
    assert.equal(url, new URL('styles.css', PUBLIC_URL).href);
    return { ok: true, text: async () => css };
  };
  const one = await auditPublicDesign({ fetcher });
  const two = await auditPublicDesign({ fetcher });
  assert.deepEqual(calls, [PUBLIC_URL, new URL('styles.css', PUBLIC_URL).href, PUBLIC_URL, new URL('styles.css', PUBLIC_URL).href]);
  assert.equal(one.source_hash, two.source_hash);
  assert.equal(typeof one.source_hash, 'string');
  assert.equal('checked_at' in one, false);
  assert.ok(options.every((item) => item.redirect === 'error' && item.signal instanceof AbortSignal));
  assert.ok(one.checks.every((item) => ['pass', 'attention', 'not_verified'].includes(item.status)));
});

test('auditPublicDesign rejects a non-fixed target before network access', async () => {
  let called = false;
  await assert.rejects(() => auditPublicDesign({ url: 'https://example.test/', fetcher: async () => { called = true; } }), /ثابت/);
  assert.equal(called, false);
});

test('evaluateDesignSources does not infer responsive visual quality from missing viewport rendering', () => {
  const result = evaluateDesignSources({ html: '<html lang="ar" dir="rtl"></html>', css: '@media (max-width: 600px) { main { display: grid; } }' });
  assert.equal(result.checks.find((item) => item.id === 'responsive').status, 'pass');
  assert.match(result.checks.find((item) => item.id === 'responsive').evidence, /وجود media query لا يثبت/);
  assert.equal(result.checks.find((item) => item.id === 'usability').status, 'not_verified');
});
