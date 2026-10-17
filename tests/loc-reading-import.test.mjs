import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeBooks, countIndexedMaterials, filterBooks, languageDistribution } from '../external-reading-model.mjs';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const readingRaw = read('../external-reading-books.json');
const catalogRaw = read('../external-catalog-records.json');
const reading = sanitizeBooks(readingRaw);
const catalog = sanitizeBooks(catalogRaw);
const audit = read('../docs/loc-reading-import-20261017.json');

test('LOC import retains every documented source record exactly once across the two availability files', () => {
  const loc = [...readingRaw, ...catalogRaw].filter(b => b.id.startsWith('loc-'));
  assert.equal(loc.length, 2772);
  assert.equal(new Set(loc.map(b => b.id)).size, 2772);
  assert.equal(reading.length, readingRaw.length);
  assert.equal(catalog.length, catalogRaw.length);
  assert.equal(catalog.filter(b => b.id.startsWith('loc-')).length, 673);
  for (const record of loc) {
    assert.match(record.source, /^https:\/\/(www|lccn)\.loc\.gov\//);
    assert.ok(record.languageCodes);
    assert.ok(record.completionStatus);
  }
});

test('every imported PDF has a successful first-byte signature check; catalog records claim no file', () => {
  const verified = new Map(audit.verifiedPdfRecords.map(record => [record.id, record]));
  assert.equal(verified.size, 2099);
  for (const record of readingRaw.filter(b => b.id.startsWith('loc-'))) {
    const evidence = verified.get(record.id);
    assert.equal(evidence.pdf, record.pdf);
    assert.equal(evidence.signature, '%PDF-');
    assert.ok([200, 206].includes(evidence.status));
  }
  for (const record of catalog) {
    assert.equal(record.availability, 'catalog-only');
    assert.equal(record.pdf, '');
    assert.equal(record.reader, '');
  }
});

test('indexed records, actual reading, complete books and periodicals remain different counts', () => {
  assert.deepEqual(countIndexedMaterials(PUBLIC_READABLE_BOOKS, reading, catalog), {
    indexedRecords: 3081, readingTitles: 2405, completeBooks: 1225,
    periodicals: 527, catalogOnly: 676, total: 2405, online: 2405, pdf: 2404,
  });
  assert.equal(filterBooks([...reading, ...catalog], { availability: 'catalog-only' }).length, 676);
  assert.equal(filterBooks([...reading, ...catalog], { availability: 'readable' }).length, 2402);
  const counts = languageDistribution([...PUBLIC_READABLE_BOOKS, ...reading, ...catalog], { deduplicateBy: 'id' });
  assert.equal(counts.find(x => x.language === 'العربية').count, 1550);
  assert.equal(counts.find(x => x.language === 'غير معروفة').count, 1);
  assert.ok(counts.reduce((sum, x) => sum + x.count, 0) > 3078);
});

test('explicit catalog-only records strip any accidental reader or PDF before display', () => {
  const [record] = sanitizeBooks([{ ...readingRaw[0], availability: 'catalog-only' }]);
  assert.equal(record.pdf, '');
  assert.equal(record.reader, '');
  assert.equal(countIndexedMaterials([], [record], []).online, 0);
});
