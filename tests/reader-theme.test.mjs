import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../reader-theme.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('reader theme is the final stylesheet and preserves public identity and placement', () => {
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  assert.match(sheets.at(-1), /^reader-theme\.css\?v=[a-f0-9]{16}$/);
  for (const text of ['المكتبة المدرسية الرقمية', 'بورسعيد', 'تصميم وبرمجة: محمد حامد', 'مسؤولية الموقع: محمد حامد']) assert.ok(html.includes(text));
  assert.ok(html.indexOf('compact-pathways') < html.indexOf('id="homeNews"'));
});
test('reader theme does not reorder, hide, crop, enlarge or replace content and assets', () => {
  assert.doesNotMatch(css, /(?:^|[;{\s])(?:display|order|position|height|min-height|max-height|width|min-width|max-width|font-size|padding|margin|overflow|object-fit|object-position|zoom)\s*:/m);
  assert.doesNotMatch(css, /url\(|line-clamp|\[hidden\]|staff-workspace|\.workspace\b/);
});
test('reader theme provides keyboard focus and reduced motion safeguards', () => {
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*3px solid #116b68/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /scroll-behavior: auto/);
  assert.match(css, /transition: none !important/);
  assert.match(css, /hover: hover/);
});
test('visible palette uses full color surfaces and readable text without changing geometry', () => {
  assert.match(css, /\.site-header \.brand \{ background: #123f47;/);
  assert.match(css, /\.site-header \.brand-copy strong \{ color: #fff;/);
  assert.match(css, /\.page-home \.portal-side-library \{ background: #dceee4;/);
  assert.match(css, /\.page-home \.portal-side-assistant \{ background: #e9e3f5;/);
  assert.match(css, /\.page-home \.portal-side-news \{ background: #f5e9c8;/);
  assert.match(css, /linear-gradient\(150deg, #cce6dd, #f8f3df\)/);
});
