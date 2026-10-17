import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public-site-stats.css', import.meta.url), 'utf8');
const moduleSource = readFileSync(new URL('../public-site-stats.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('public stats are placed above the copyright and explain aggregate scope', () => {
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer);
  assert.ok(footer.indexOf('publicPageViewStats') < footer.indexOf('footer-bottom'));
  assert.match(footer, /الإجمالي المسجل/);
  assert.match(footer, /مشاهدات أقسام الموقع وليست زوارًا فريدين/);
  assert.match(footer, /حتى 400 يوم/);
});

test('public stats use the existing anonymous analytics client and show a dash on failure', () => {
  assert.match(app, /loadPublicPageViewStats\(\{ client: publicAnalyticsSupabase, root: \$\('\#publicPageViewStats'\) \}\)/);
  assert.match(moduleSource, /client\.rpc\(rpcName\)/);
  assert.match(moduleSource, /const DASH = '—'/);
  assert.match(moduleSource, /تعذّر تحميل الإحصاءات/);
  assert.match(moduleSource, /Array\.isArray\(data\) \? data\[0\] : data/);
});

test('public stats box is compact and responsive RTL', () => {
  assert.match(css, /\.public-page-view-stats\{/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:420px\)/);
  assert.match(html, /id="publicPageViewStats" dir="rtl"/);
});
