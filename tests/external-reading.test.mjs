import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterBooks, isAllowedExternalUrl, languageDistribution, normalizeArabic, normalizeLanguageMetadata, sanitizeBooks } from '../external-reading-model.mjs';

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
  assert.equal(new Set(clean.map(book => normalizeArabic(book.title))).size, clean.length);
  for (const book of clean) {
    assert.ok(book.rightsUrl);
    assert.ok(book.language && Array.isArray(book.languages) && book.languages.length > 0);
  }
});

test('verified astronomy, geography and botany batch retains official reader and direct PDF links', () => {
  const raw = JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url), 'utf8'));
  const ids = ['aub_aco001576', 'aub_aco001532', 'nyu_aco001569', 'columbia_aco003217', 'columbia_aco003934', 'aub_aco001827', 'auc_aco000384', 'columbia_aco002956', 'columbia_aco000645', 'aub_aco004424'];
  for (const id of ids) {
    const matches = raw.filter(book => book.id === `aco-${id}`);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].reader, `https://aco.dlib.nyu.edu/book/${id}/1?lang=ar`);
    assert.equal(matches[0].pdf, `https://mc.dlib.nyu.edu/files/books/${id}/${id}_lo.pdf`);
    assert.equal(matches[0].rightsUrl, 'https://aco.dlib.nyu.edu/about');
    assert.equal(matches[0].searchable, false);
  }
});

test('allows every loc.gov subdomain but rejects lookalike hosts', () => {
  assert.equal(isAllowedExternalUrl('https://www.loc.gov/item/1'), true);
  assert.equal(isAllowedExternalUrl('https://catalog.loc.gov/item/1'), true);
  assert.equal(isAllowedExternalUrl('https://loc.gov.evil.example/item/1'), false);
  assert.equal(isAllowedExternalUrl('https://evil-loc.gov.example/item/1'), false);
});

test('keeps ambiguous language explicitly unknown and preserves multilingual metadata', () => {
  const records = sanitizeBooks([
    { id: 'unknown', title: 'Unknown', language: 'unknown', kind: 'كتاب', sourceName: 'x', source: 'https://www.loc.gov/x', reader: 'https://www.loc.gov/r', rights: 'open' },
    { id: 'multi', title: 'Multi', languageCodes: ['ar', 'en'], kind: 'بحث', sourceName: 'x', source: 'https://www.loc.gov/x', reader: 'https://www.loc.gov/r', rights: 'open' },
  ]);
  assert.equal(records[0].languageUnknown, true);
  assert.equal(records[0].language, 'غير معروفة');
  assert.deepEqual(records[1].languages, ['العربية', 'الإنجليزية']);
  assert.equal(filterBooks(records, { language: 'الإنجليزية', kind: 'بحث' }).length, 1);
  assert.equal(filterBooks(records, { query: 'الإنجليزية' }).length, 1);
});


test('uses supplied Arabic labels once and keeps ISO codes stable', () => {
  const metadata = normalizeLanguageMetadata({ languageCodes: ['ara', 'eng'], languages: ['العربية', 'الإنجليزية'], language: 'العربية، الإنجليزية' });
  assert.deepEqual(metadata.languageCodes, ['ara', 'eng']);
  assert.deepEqual(metadata.languages, ['العربية', 'الإنجليزية']);
  assert.equal(new Set(metadata.languages).size, metadata.languages.length);
});

test('counts legacy local Arabic language and leaves unknown codes unknown', () => {
  assert.deepEqual(normalizeLanguageMetadata({ language: 'العربية' }).languages, ['العربية']);
  for (const code of ['und', 'mul']) {
    const metadata = normalizeLanguageMetadata({ languageCodes: [code] });
    assert.deepEqual(metadata.languages, ['غير معروفة']);
    assert.equal(metadata.languageUnknown, true);
    assert.deepEqual(metadata.languageCodes, [code]);
  }
});

test('deduplicates normalized titles independently within each language', () => {
  assert.deepEqual(languageDistribution([
    { title: 'كتاب واحد', language: 'العربية' },
    { title: 'كِتاب واحد', language: 'العربية' },
    { title: 'كتاب واحد', languageCodes: ['eng'] },
    { title: 'كتاب مختلف', languages: ['العربية', 'الإنجليزية'] },
  ]).sort((a, b) => a.language.localeCompare(b.language, 'ar')), [
    { language: 'العربية', count: 2 },
    { language: 'الإنجليزية', count: 2 },
  ].sort((a, b) => a.language.localeCompare(b.language, 'ar')));
});
