import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../visual-polish.css', import.meta.url), 'utf8');
const credits = html.match(/<details\b[^>]*id="leaderImageCredits"[^>]*>[\s\S]*?<\/details>/)?.[0];

test('photo credits use a concise native disclosure closed by default', () => {
  assert.ok(credits);
  assert.match(credits, /<summary>حقوق الصور<\/summary>/);
  assert.doesNotMatch(credits.split('>')[0], /\bopen\b/);
  assert.doesNotMatch(credits, /تفاصيل إضافية/);
  assert.match(credits, /<ul class="leadership-credits-list">/);
  assert.equal((credits.match(/<li>/g) || []).length, 3);
});

test('required creator, source, license and crop disclosure remain available', () => {
  for (const text of ['المكتب الرئاسي الروسي', 'Kremlin.ru', 'CC BY 4.0', 'قصّ بصري', 'وزارة التربية والتعليم المصرية', '١٤١ لسنة ٢٠٠٢', 'أميرة عبد اللطيف', 'محمود بدوي', 'حسن محمد حسن', 'محمد سمير أبو عميرة', 'محمد حامد']) {
    assert.ok(credits.includes(text), text);
  }
  for (const url of [
    'https://commons.wikimedia.org/wiki/File:Abdel_Fattah_el-Sisi.jpg',
    'https://creativecommons.org/licenses/by/4.0/',
    'https://commons.wikimedia.org/wiki/File:Mohamed_Abdel_Latif.jpg'
  ]) assert.ok(credits.includes(`href="${url}"`), url);
  assert.equal((credits.match(/rel="noopener noreferrer"/g) || []).length, 3);
});

test('credits retain a touch target, visible keyboard focus and wrapping', () => {
  assert.match(css, /\.leadership-photo-credits summary\{[^}]*min-height:44px/s);
  assert.match(css, /\.leadership-photo-credits summary:focus-visible\{[^}]*outline:2px solid/s);
  assert.match(css, /\.leadership-credits-list\{[^}]*overflow-wrap:anywhere/s);
  assert.match(html, /visual-polish\.css\?v=20261018-photo-credits-1/);
});
