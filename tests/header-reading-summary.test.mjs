import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countReadingTitles, refreshHeaderReadingSummary } from '../header-reading-summary.js';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
import { sanitizeBooks } from '../external-reading-model.mjs';

const external = sanitizeBooks(JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url))));

test('current reading totals count unique titles and overlapping formats only once', () => {
  assert.equal(external.length, 300);
  assert.deepEqual(countReadingTitles(PUBLIC_READABLE_BOOKS, external), { total: 296, online: 296, pdf: 295 });
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [key, value] of Object.entries(countReadingTitles(PUBLIC_READABLE_BOOKS, external))) {
    assert.ok(html.includes(`data-reading-count="${key}">${value.toLocaleString('ar-EG')}</strong>`));
  }
  assert.ok(html.indexOf('id="headerReadingSummary"') > html.indexOf('id="headerVisitorChatShortcut"'));
  assert.ok(html.indexOf('id="headerReadingSummary"') > html.indexOf('<figure class="president-banner"'));
  assert.ok(html.indexOf('header-development-notice') < html.indexOf('<figure class="president-banner"'));
  assert.ok(html.includes('يُرجى زيارة الموقع باستمرار للاطلاع على آخر التحديثات.'));
  const president = html.slice(html.indexOf('<figure class="president-banner"'), html.indexOf('</figure>'));
  assert.ok(!president.includes('الموقع قيد التطوير'));
  assert.ok(president.includes('ضمن الإجمالي'));
  assert.ok(!html.includes('نطوّر الموقع باستمرار'));
  assert.ok(html.includes('مؤسس مصر الحديثة'));
  assert.ok(html.includes('ستضاف كتب أخرى تباعًا.'));
});

test('Arabic spelling duplicates merge access flags, but different volumes stay distinct', () => {
  assert.deepEqual(countReadingTitles([{ title: 'مسرحية الأب', pdf: 'one.pdf' }], [
    { title: 'مسرحية الاب', reader: 'https://example.org/read' },
    { title: 'العلم — المجلد 1', reader: 'https://example.org/1' },
    { title: 'العلم — المجلد 2', pdf: 'two.pdf' },
  ]), { total: 3, online: 3, pdf: 2 });
  assert.deepEqual(countReadingTitles([], []), { total: 0, online: 0, pdf: 0 });
});

function fakeDocument() {
  const nodes = Object.fromEntries(['total', 'online', 'pdf'].map(key => [key, { textContent: 'snapshot' }]));
  const status = { textContent: '', hidden: true };
  const root = { dataset: {}, querySelector(selector) { return selector === '[data-reading-status]' ? status : nodes[selector.match(/"(.*?)"/)[1]]; } };
  return { documentRef: { querySelector: () => root }, root, nodes, status };
}

test('refresh uses current public files without touching catalog, tickets or Telegram', async () => {
  const fixture = fakeDocument();
  await refreshHeaderReadingSummary({ ...fixture, fetchImpl: async (url, options) => {
    assert.equal(url.pathname.endsWith('/external-reading-books.json'), true);
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => external };
  } });
  assert.equal(fixture.nodes.total.textContent, '٢٩٦');
  assert.equal(fixture.nodes.pdf.textContent, '٢٩٥');
  assert.equal(fixture.root.dataset.countsSource, 'current-files');
  assert.equal(fixture.status.hidden, true);
});

test('fetch failure keeps verified snapshot and labels it honestly', async () => {
  const fixture = fakeDocument();
  await refreshHeaderReadingSummary({ ...fixture, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(fixture.nodes.total.textContent, 'snapshot');
  assert.equal(fixture.root.dataset.countsSource, 'publication-snapshot');
  assert.equal(fixture.status.hidden, false);
  assert.match(fixture.status.textContent, /آخر حصر موثّق/);
});
