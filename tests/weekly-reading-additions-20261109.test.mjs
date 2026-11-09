import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
import { countIndexedMaterials, isAllowedExternalUrl, languageDistribution, normalizeArabic, sanitizeBooks } from '../external-reading-model.mjs';
import { countPdfLocations, countReadingTitles } from '../header-reading-summary.js';

const reading = JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../external-catalog-records.json', import.meta.url), 'utf8'));
const newReadingIds = [
  'openedition-oep-1600',
  'openedition-oep-1548',
  'paper-invecom-10-5281-zenodo-17238020',
];
const newCatalogIds = ['doaj-revista-portuguesa-educacao-2183-0452'];
const expectedReadingCounts = {
  indexedRecords: 3222, readingTitles: 2539, completeBooks: 1353,
  periodicals: 532, catalogOnly: 683, total: 2539, online: 2539, pdf: 2410,
};

test('imports four unique official records and preserves the distinct 2026 Spanish article already indexed', () => {
  const records = [...sanitizeBooks(reading), ...sanitizeBooks(catalog)];
  for (const id of [...newReadingIds, ...newCatalogIds]) assert.equal(records.filter(record => record.id === id).length, 1, id);
  assert.equal(records.filter(record => record.doi === '10.47606/acven/ph0457').length, 1);
  assert.equal(records.filter(record => normalizeArabic(record.title) === normalizeArabic('Producción científica sobre sostenibilidad en español: un análisis bibliométrico en Scopus')).length, 1);
  const newPaper = records.find(record => record.id === 'paper-invecom-10-5281-zenodo-17238020');
  assert.ok(records.some(record => record.issn === newPaper.issn && record.doi !== newPaper.doi), 'a journal ISSN shared by distinct papers is not a duplicate key for an article');
});

test('keeps books, the paper and the periodical distinct and applies legal external URLs', () => {
  const newReading = sanitizeBooks(reading.filter(record => newReadingIds.includes(record.id)));
  const newCatalog = sanitizeBooks(catalog.filter(record => newCatalogIds.includes(record.id)));
  assert.equal(newReading.length, 3);
  assert.equal(newCatalog.length, 1);
  assert.equal(newReading.filter(record => record.recordType === 'book' && /كتاب|مجلد|جزء/.test(record.kind)).length, 2);
  assert.ok(newReading.filter(record => record.recordType === 'paper').every(record => !/كتاب|مجلد|جزء/.test(record.kind)));
  assert.equal(newCatalog[0].recordType, 'periodical');
  assert.equal(newCatalog[0].availability, 'catalog-only');
  assert.equal(newCatalog[0].reader, '');
  assert.equal(newCatalog[0].pdf, '');
  for (const record of newReading) {
    assert.ok(record.reader, record.id);
    assert.ok(isAllowedExternalUrl(record.source), record.source);
    if (record.pdf) assert.ok(isAllowedExternalUrl(record.pdf), record.pdf);
    assert.ok(record.rights && record.completionStatus, record.id);
  }
  assert.deepEqual(newReading.find(record => record.id === 'openedition-oep-1600').languages, ['الفرنسية']);
  assert.deepEqual(newReading.find(record => record.id === 'openedition-oep-1548').languages, ['الفرنسية']);
  assert.deepEqual(newReading.find(record => record.id === 'paper-invecom-10-5281-zenodo-17238020').languages, ['الإسبانية']);
});

test('updates indexed, reading, complete-book, periodical and PDF totals independently', () => {
  assert.deepEqual(countIndexedMaterials(PUBLIC_READABLE_BOOKS, reading, catalog), expectedReadingCounts);
  assert.deepEqual(countReadingTitles(PUBLIC_READABLE_BOOKS, sanitizeBooks(reading)), { total: 2539, online: 2539, pdf: 2410 });
  assert.deepEqual(countPdfLocations(PUBLIC_READABLE_BOOKS, sanitizeBooks(reading)), { localPdfFiles: 3, externalPdf: 2407 });
});

test('updates language counts using the actual full-text and journal-language metadata', () => {
  const counts = Object.fromEntries(languageDistribution([...PUBLIC_READABLE_BOOKS, ...sanitizeBooks(reading), ...sanitizeBooks(catalog)], { deduplicateBy: 'id' }).map(({ language, count }) => [language, count]));
  assert.equal(counts['الفرنسية'], 28);
  assert.equal(counts['الإسبانية'], 32);
  assert.equal(counts['البرتغالية'], 74);
  assert.equal(counts['الإنجليزية'], 1262);
});
