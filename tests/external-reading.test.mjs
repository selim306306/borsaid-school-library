import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countIndexedMaterials, filterBooks, isAllowedExternalUrl, languageDistribution, normalizeArabic, normalizeLanguageMetadata, sanitizeBooks } from '../external-reading-model.mjs';
import * as readingModel from '../external-reading-model.mjs';

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

test('recognizes only the official multilingual publication hosts added for this batch', () => {
  for (const url of [
    'https://open.umn.edu/opentextbooks/textbooks/francais-interactif',
    'https://laits.utexas.edu/fi/toc/00/',
    'https://books.openedition.org/ledizioni/185',
    'https://doaj.org/toc/2959-314X',
    'https://ve.scielo.org/scielo.php?script=sci_arttext&pid=S2739-00632025000202050',
    'https://ejournal.unuja.ac.id/index.php/ij-atl/article/view/15184',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC9874500/',
  ]) assert.equal(isAllowedExternalUrl(url), true, url);
  for (const url of [
    'https://books.openedition.org.evil.example/ledizioni/185',
    'https://doaj.org.evil.example/toc/2959-314X',
    'https://pmc.ncbi.nlm.nih.gov.evil.example/articles/PMC9874500/',
  ]) assert.equal(isAllowedExternalUrl(url), false, url);
});

test('preserves ISSN and DOI as bibliographic identifiers', () => {
  const [record] = sanitizeBooks([{
    id: 'bibliographic-identifiers', title: 'ورقة تجريبية', kind: 'ورقة علمية',
    sourceName: 'ناشر رسمي', source: 'https://www.loc.gov/item/1/',
    rights: 'بيانات فهرسة فقط', availability: 'catalog-only',
    issn: '2549-368X', doi: '10.33650/ijatl.v10i1.15184',
  }]);
  assert.equal(record.issn, '2549-368X');
  assert.equal(record.doi, '10.33650/ijatl.v10i1.15184');
});

test('provides citation details and the specific incomplete-record status for display', () => {
  assert.equal(typeof readingModel.bibliographicMetadataLines, 'function');
  assert.deepEqual(readingModel.bibliographicMetadataLines({
    isbn: '9781937963040', issn: '2549-368X', doi: '10.33650/ijatl.v10i1.15184',
    volume: '10', issue: '1', pages: '96–104',
  }), ['ISBN: 9781937963040', 'ISSN: 2549-368X', 'DOI: 10.33650/ijatl.v10i1.15184', 'المجلد: 10 · العدد: 1', 'الصفحات: 96–104']);
  assert.equal(typeof readingModel.recordCompletionStatus, 'function');
  assert.equal(readingModel.recordCompletionStatus({ availability: 'catalog-only', completionStatus: 'سجل متحقق جزئيًا؛ لم يُعتمد PDF بسبب تعارض بيان الرخصة.' }), 'سجل متحقق جزئيًا؛ لم يُعتمد PDF بسبب تعارض بيان الرخصة.');
  assert.match(readingModel.recordCompletionStatus({ availability: 'catalog-only' }), /سجل فهرسة/);
});

test('adds the verified multilingual books, papers and periodicals with distinct counts', () => {
  const readingRaw = JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url), 'utf8'));
  const catalogRaw = JSON.parse(readFileSync(new URL('../external-catalog-records.json', import.meta.url), 'utf8'));
  const readingIds = new Set([
    'otl-2019-francais-interactif',
    'openedition-ledizioni-2012-creative-commons-guia',
    'openedition-oep-2016-escravidao-subjetividades',
    'scielo-paper-ric-2025-e502050',
  ]);
  const catalogIds = new Set([
    'doaj-periodical-2959-314x',
    'doaj-periodical-1518-2924',
    'ijatl-paper-2026-15184',
    'pmc-paper-pmc9874500',
  ]);
  const newReading = sanitizeBooks(readingRaw.filter(record => readingIds.has(record.id)));
  const newCatalog = sanitizeBooks(catalogRaw.filter(record => catalogIds.has(record.id)));
  assert.equal(newReading.length, 4);
  assert.equal(newCatalog.length, 4);
  assert.equal(new Set([...newReading, ...newCatalog].map(record => normalizeArabic(record.title))).size, 8);
  assert.ok(newReading.every(record => record.availability !== 'catalog-only' && record.reader));
  assert.ok(newCatalog.every(record => record.reader || record.availability === 'catalog-only'));
  assert.equal(newCatalog.find(record => record.id === 'doaj-periodical-2959-314x').recordType, 'periodical');
  assert.equal(newCatalog.find(record => record.id === 'doaj-periodical-1518-2924').recordType, 'periodical');
  assert.equal(newCatalog.find(record => record.id === 'pmc-paper-pmc9874500').availability, 'catalog-only');
  assert.equal(newCatalog.find(record => record.id === 'pmc-paper-pmc9874500').reader, '');
  assert.equal(newCatalog.find(record => record.id === 'ijatl-paper-2026-15184').availability, 'catalog-only');
  assert.equal(newCatalog.find(record => record.id === 'ijatl-paper-2026-15184').pdf, '');
  const metrics = countIndexedMaterials([], newReading, newCatalog);
  assert.deepEqual(metrics, {
    indexedRecords: 8, readingTitles: 4, completeBooks: 3, periodicals: 2,
    catalogOnly: 4, total: 4, online: 4, pdf: 2,
  });
  assert.deepEqual(Object.fromEntries(languageDistribution([...newReading, ...newCatalog], { deduplicateBy: 'id' }).map(({ language, count }) => [language, count])), {
    'الإنجليزية': 6, 'الإسبانية': 3, 'الفرنسية': 2, 'العربية': 2, 'البرتغالية': 2,
  });
  assert.equal(newReading.find(record => record.id === 'otl-2019-francais-interactif').isbn, '9781937963040');
  assert.equal(newCatalog.find(record => record.id === 'ijatl-paper-2026-15184').doi, '10.33650/ijatl.v10i1.15184');
  assert.equal(newReading.find(record => record.id === 'scielo-paper-ric-2025-e502050').issn, '2739-0063');
});
