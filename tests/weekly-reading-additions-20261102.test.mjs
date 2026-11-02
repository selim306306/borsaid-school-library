import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
import { countIndexedMaterials, isAllowedExternalUrl, languageDistribution, normalizeArabic, sanitizeBooks } from '../external-reading-model.mjs';
import { countPdfLocations, countReadingTitles } from '../header-reading-summary.js';

const reading = JSON.parse(readFileSync(new URL('../external-reading-books.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../external-catalog-records.json', import.meta.url), 'utf8'));
const expectedReadingIds = [
  'storyweaver-61355-mahapran',
  'openedition-etnograficapress-3996-o-povo-portugues-ii',
  'scielo-10.47606-acven-ph0457-produccion-cientifica-sostenibilidad',
  'paper-frontiers-10-3389-fdgth-2021-615366',
];
const expectedCatalogIds = [
  'arabi-journal-arabic-studies-2548-6624',
  'periodical-lisan-al-arab-2252-6269',
];

test('accepts the verified official Frontiers PDF without allowing lookalike hosts', () => {
  const pdf = 'https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2021.615366/pdf';
  assert.equal(isAllowedExternalUrl(pdf), true);
  assert.equal(isAllowedExternalUrl(pdf.replace('www.frontiersin.org', 'frontiersin.org.example.net')), false);
  assert.equal(isAllowedExternalUrl(pdf.replace('https:', 'http:')), false);
});

test('adds only unique weekly records and keeps full books, research papers and journals distinct', () => {
  const added = sanitizeBooks([...reading, ...catalog].filter(record => [...expectedReadingIds, ...expectedCatalogIds].includes(record.id)));
  const newReading = added.filter(record => expectedReadingIds.includes(record.id));
  const newCatalog = added.filter(record => expectedCatalogIds.includes(record.id));
  assert.equal(newReading.length, 4);
  assert.equal(newCatalog.length, 2);
  assert.equal(new Set(added.map(record => normalizeArabic(record.title))).size, 6);
  assert.ok(newReading.every(record => record.availability !== 'catalog-only' && record.reader));
  assert.equal(newReading.filter(record => record.recordType === 'book' && /كتاب|مجلد|جزء/.test(record.kind)).length, 2);
  assert.ok(newReading.filter(record => record.recordType === 'paper').every(record => !/كتاب|مجلد|جزء/.test(record.kind)));
  assert.ok(newCatalog.every(record => record.recordType === 'periodical' && record.availability === 'catalog-only' && !record.reader && !record.pdf));
  assert.equal(newReading.find(record => record.id === 'paper-frontiers-10-3389-fdgth-2021-615366').pdf, 'https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2021.615366/pdf');
  assert.deepEqual(countIndexedMaterials(PUBLIC_READABLE_BOOKS, reading, catalog), {
    indexedRecords: 3218, readingTitles: 2536, completeBooks: 1351,
    periodicals: 531, catalogOnly: 682, total: 2536, online: 2536, pdf: 2408,
  });
  assert.deepEqual(countPdfLocations(PUBLIC_READABLE_BOOKS, reading), { localPdfFiles: 3, externalPdf: 2405 });
  assert.deepEqual(countReadingTitles(PUBLIC_READABLE_BOOKS, reading), { total: 2536, online: 2536, pdf: 2408 });
  const languages = Object.fromEntries(languageDistribution(added, { deduplicateBy: 'id' }).map(({ language, count }) => [language, count]));
  assert.deepEqual(languages, {
    'البنغالية': 1, 'البرتغالية': 1, 'العربية': 2,
    'الإندونيسية': 2, 'الإسبانية': 1, 'الإنجليزية': 3,
  });
});
