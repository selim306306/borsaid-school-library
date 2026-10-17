import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeBooks, filterBooks, countIndexedMaterials, isAllowedExternalUrl } from '../external-reading-model.mjs';
const raw = JSON.parse(readFileSync(new URL('../external-catalog-records.json', import.meta.url)));
const seriesRaw = raw.filter(b => b.seriesId === 'ard-zikola');
const series = sanitizeBooks(seriesRaw);
const titles = ['أرض زيكولا', 'أماريتا', 'وادي الذئاب المنسية'];
const slugs = ['أرض-زيكولا', 'أماريتا-سلسلة-أرض-زيكولا-الجزء-الثاني', 'وادي-الذئاب-المنسية-سلسلة-أرض-زيكولا-الجزء-الثالث'];
test('Zikola trilogy remains three ordered print book records with verified publisher links', () => {
  assert.equal(series.length, 3);
  assert.deepEqual(series.map(b => b.title), titles);
  assert.deepEqual(series.map(b => b.seriesOrder), [1, 2, 3]);
  assert.equal(new Set(raw.map(b => b.id)).size, raw.length);
  for (const [i, b] of series.entries()) {
    assert.equal(b.author, 'عمرو عبد الحميد');
    assert.equal(b.seriesTitle, 'أرض زيكولا');
    assert.equal(b.publisher, 'عصير الكتب للترجمة والنشر والتوزيع');
    assert.equal(b.source, 'https://www.aseeralkotb.com/ar/books/' + slugs[i]);
    assert.equal(b.rightsUrl, b.source);
    assert.equal(b.kind, 'كتاب مطبوع — رابط الناشر');
    assert.equal(b.recordType, 'book');
    assert.equal(b.availability, 'catalog-only');
    assert.equal(b.reader, ''); assert.equal(b.pdf, '');
  }
});
test('publisher links reject unsafe schemes, credentials, ports and lookalike domains', () => {
  assert.equal(isAllowedExternalUrl(series[0].source), true);
  for (const url of ['http://www.aseeralkotb.com/ar/books/x', 'https://www.aseeralkotb.com.evil.example/x', 'https://evil-aseeralkotb.com/x', 'https://user:pass@www.aseeralkotb.com/x', 'https://www.aseeralkotb.com:444/x', 'javascript:alert(1)']) assert.equal(isAllowedExternalUrl(url), false);
});
test('search discovers trilogy by series, normalized author, title, publisher and filters', () => {
  for (const query of ['سلسلة أرض زيكولا', 'عمرو عبد الحميد', 'عمرو عبد الْحَميد', 'عصير الكتب']) {
    assert.equal(filterBooks(series, { query }).length, 3);
  }
  assert.equal(filterBooks(series, { query: 'اماريتا' })[0].title, 'أماريتا');
  assert.equal(filterBooks(series, { query: 'وادي الذياب المنسية' })[0].title, titles[2]);
  assert.equal(filterBooks(series, { query: '9789776382398' })[0].title, titles[0]);
  for (const options of [{ subject: 'روايات' }, { source: 'عصير الكتب — الناشر الرسمي' }, { language: 'العربية' }, { kind: 'كتاب مطبوع — رابط الناشر' }, { availability: 'catalog-only' }]) assert.equal(filterBooks(series, options).length, 3);
  assert.equal(filterBooks(series, { availability: 'readable' }).length, 0);
  assert.equal(filterBooks(series, { subject: 'العلوم' }).length, 0);
});
test('print trilogy never inflates reading, PDF or complete-book counts, even with accidental file fields', () => {
  const clean = sanitizeBooks(seriesRaw.map(b => ({ ...b, reader: b.source, pdf: b.source })));
  assert.equal(clean.length, 3);
  assert.ok(clean.every(b => !b.reader && !b.pdf));
  assert.deepEqual(countIndexedMaterials([], [], clean), { indexedRecords: 3, readingTitles: 0, completeBooks: 0, periodicals: 0, catalogOnly: 3, total: 0, online: 0, pdf: 0 });
});
