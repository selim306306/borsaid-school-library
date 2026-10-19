import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { countPdfLocations, countReadingTitles } from '../header-reading-summary.js';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
import { sanitizeBooks } from '../external-reading-model.mjs';
const external = sanitizeBooks(JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url))));
test('PDF hosting is counted from real reviewed local files, not external metadata', () => {
  const counts = countPdfLocations(PUBLIC_READABLE_BOOKS, external);
  assert.deepEqual(counts, { localPdfFiles: 3, externalPdf: 2401 });
  assert.equal(countReadingTitles(PUBLIC_READABLE_BOOKS, external).pdf, 2404);
  for (const book of PUBLIC_READABLE_BOOKS) assert.ok(existsSync(new URL('../' + book.pdf, import.meta.url)));
  assert.equal(readdirSync(new URL('../', import.meta.url)).filter(name => name.endsWith('.pdf')).length, 3);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [key, value] of Object.entries(counts)) assert.ok(html.includes(`data-reading-count="${key}">${value.toLocaleString('ar-EG')}</strong>`));
  assert.match(html, /عناوين لها رابط <bdi>PDF<\/bdi>/);
  assert.match(html, /مستضافة محليًا/);
  assert.match(html, /الروابط ليست ضمانًا لاستمرار التحميل/);
});
test('external links cannot inflate local hosting and title duplicates are folded', () => {
  assert.deepEqual(countPdfLocations([
    { title: 'كتاب', pdf: 'one.pdf' }, { title: 'نسخة', pdf: 'one.pdf' },
    { title: 'خارج', pdf: 'https://example.org/book.pdf' },
    { title: 'تجاوز', pdf: '../other.pdf' },
  ], [
    { title: 'خارج', pdf: 'https://example.org/other.pdf' },
    { title: 'ملف مزعوم خارجي', pdf: 'fake-local.pdf' },
    { title: 'فهرسة', pdf: 'https://example.org/catalog.pdf', availability: 'catalog-only' },
  ]), { localPdfFiles: 1, externalPdf: 1 });
});
