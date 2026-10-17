import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVisitorCatalogIntent, isClearVisitorCatalogSearch } from '../visitor-catalog-intent.mjs';

test('general guidance is not a catalog search', () => {
  assert.equal(classifyVisitorCatalogIntent('كيف أبحث في الفهرس؟').kind, 'general');
  assert.equal(isClearVisitorCatalogSearch('كيف أبحث عن كتاب؟'), false);
});

test('explicit catalog requests are searchable', () => {
  assert.equal(classifyVisitorCatalogIntent('ابحث عن كتاب حي بن يقظان').kind, 'search');
  assert.equal(classifyVisitorCatalogIntent('هل يوجد كتاب عن تاريخ بورسعيد؟').kind, 'search');
});

test('a bare title asks for clarification instead of triggering search', () => {
  assert.equal(classifyVisitorCatalogIntent('حي بن يقظان').kind, 'clarify');
});
