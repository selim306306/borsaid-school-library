import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterBooks, isAllowedExternalUrl, normalizeArabic, sanitizeBooks } from '../external-reading-model.mjs';

const books = sanitizeBooks([
  { id: '1', title: 'إحياء علوم الدين', author: 'أبو حامد الغزالي', subject: 'تصوف', category: 'تراث', sourceName: 'هنداوي', source: 'https://www.hindawi.org/books/1/', reader: 'https://www.hindawi.org/books/1/read/', rights: 'متاح للقراءة', searchable: true },
  { id: '2', title: 'رحلة إلى مصر', author: 'كاتب', subject: 'تاريخ', category: 'رحلات', sourceName: 'صفحات', source: 'https://safahat.org/book/2', reader: 'https://safahat.org/read/2', rights: 'بحسب المصدر', searchable: 'true' },
], { currentOrigin: 'https://library.example' });

test('normalizes Arabic diacritics, hamza variants and whitespace', () => {
  assert.equal(normalizeArabic('  إِحْيَاءُ   '), 'احياء');
  assert.equal(normalizeArabic('أبو  أحمد'), 'ابو احمد');
});

test('allows only approved HTTPS source hosts without credentials', () => {
  assert.equal(isAllowedExternalUrl('https://www.hindawi.org/book'), true);
  assert.equal(isAllowedExternalUrl('https://sub.mc.dlib.nyu.edu/read'), true);
  assert.equal(isAllowedExternalUrl('https://evil.example/hindawi.org'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedExternalUrl('http://aco.dlib.nyu.edu/book'), false);
  assert.equal(isAllowedExternalUrl('https://user:pass@aco.dlib.nyu.edu/book'), false);
});

test('filters title, author, subject and source with normalized Arabic query', () => {
  assert.equal(filterBooks(books, { query: 'الغزالي' }).length, 1);
  assert.equal(filterBooks(books, { query: 'احياء' }).length, 1);
  assert.equal(filterBooks(books, { subject: 'رحلات' })[0].id, '2');
  assert.equal(filterBooks(books, { source: 'هنداوي' })[0].id, '1');
  assert.equal(filterBooks(books, { query: 'الغزالي احياء' })[0].id, '1');
});

test('rejects incomplete or unapproved records without inventing data', () => {
  const result = sanitizeBooks([{ id: 'bad', title: 'x', sourceName: 'x', source: 'https://evil.example', reader: 'https://evil.example', rights: 'x' }]);
  assert.deepEqual(result, []);
  assert.equal(books[1].searchable, true);
});

test('published external collection is unique, complete and uses official source links', () => {
  const raw = JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url), 'utf8'));
  const clean = sanitizeBooks(raw);
  assert.ok(clean.length >= 200);
  assert.equal(clean.length, raw.length);
  assert.equal(new Set(clean.map(book => book.id)).size, clean.length);
  assert.equal(new Set(clean.map(book => book.reader)).size, clean.length);
  for (const book of clean) {
    assert.ok(book.rightsUrl);
    assert.ok(book.language.includes('العربية'));
  }
});
