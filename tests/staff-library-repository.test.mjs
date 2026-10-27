import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const feature = await import('../staff-library-repository.mjs').catch(() => null);
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function requireFeature(t) {
  if (feature) return true;
  assert.ok(feature, 'staff library repository module should be available');
  t.skip('module not implemented yet');
  return false;
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced ${signature}`);
}

function createHarness({ rows = {}, failure = null } = {}) {
  const queries = [];
  const writes = [];
  const paginations = [];
  const staffClient = {
    from(table) {
      const query = {
        table,
        columns: null,
        filters: [],
        orders: [],
        select(columns) { this.columns = columns; return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        order(column) { this.orders.push(column); return this; },
      };
      queries.push(query);
      return query;
    },
    insert(...args) { writes.push(['insert', ...args]); },
    update(...args) { writes.push(['update', ...args]); },
    delete(...args) { writes.push(['delete', ...args]); },
  };
  return {
    queries, writes, paginations, staffClient,
    create(getLibraryId = () => 'library-A') {
      return feature.createStaffLibraryRepository({
        getSupabase: () => staffClient,
        getLibraryId,
        fetchAllPages: async makeQuery => {
          const query = makeQuery();
          paginations.push(query);
          if (failure) throw failure;
          return rows[query.table] || [];
        },
      });
    },
  };
}

test('all three reads use the staff client, selected fields, current library scope, and paging', async t => {
  if (!requireFeature(t)) return;
  const harness = createHarness({ rows: {
    catalog_titles: [{ id: 'title-1', general_number: 'SYN-1', title: 'عنوان اصطناعي' }],
    holdings: [{ id: 'holding-1', title_id: 'title-1', status: 'available' }],
    branches: [{ id: 'branch-1', name: 'فرع اختباري', governorate: 'بورسعيد', city: 'مدينة اختبار', public_address: 'عنوان تجريبي', public_phone: '0000000000', public_email: 'test@example.invalid', is_published: true }],
  } });
  const libraryId = 'library-A';
  const repository = harness.create(() => libraryId);
  assert.equal((await repository.listCatalogTitles()).length, 1);
  assert.equal((await repository.listHoldings()).length, 1);
  assert.equal((await repository.listBranches()).length, 1);
  assert.deepEqual(harness.queries.map(query => [query.table, query.columns, query.filters, query.orders]), [
    ['catalog_titles', 'id,general_number,title,author,classification,isbn,series_name,is_published', [['library_id', 'library-A']], ['title']],
    ['holdings', 'id,title_id,branch_id,inventory_tag,cabinet_code,shelf_code,public_shelf_label,status,created_at', [['library_id', 'library-A']], ['created_at']],
    ['branches', 'id,name,governorate,city,public_address,public_phone,public_email,is_published', [['library_id', 'library-A']], ['name']],
  ]);
  assert.equal(harness.paginations.length, 3);
  assert.ok(harness.paginations.every(query => query && query.table));
  assert.deepEqual(harness.writes, []);
});

test('each request reads the latest selected library ID rather than retaining an earlier library', async t => {
  if (!requireFeature(t)) return;
  const harness = createHarness();
  let currentLibrary = 'library-A';
  const repository = harness.create(() => currentLibrary);
  await repository.listCatalogTitles();
  currentLibrary = 'library-B';
  await repository.listCatalogTitles();
  assert.deepEqual(harness.queries.map(query => query.filters), [
    [['library_id', 'library-A']],
    [['library_id', 'library-B']],
  ]);
});

test('an empty library returns an empty result without inventing catalog rows', async t => {
  if (!requireFeature(t)) return;
  const repository = createHarness({ rows: { catalog_titles: [] } }).create();
  assert.deepEqual(await repository.listCatalogTitles(), []);
});

test('missing session client or library scope fails closed before querying', async t => {
  if (!requireFeature(t)) return;
  let queryCount = 0;
  const repository = feature.createStaffLibraryRepository({
    getSupabase: () => ({ from() { queryCount += 1; } }),
    getLibraryId: () => null,
    fetchAllPages: async makeQuery => makeQuery(),
  });
  await assert.rejects(repository.listCatalogTitles(), /المكتبة المختارة/);
  assert.equal(queryCount, 0);
});

test('query failures are surfaced as a clear read error without trying a write', async t => {
  if (!requireFeature(t)) return;
  const harness = createHarness({ failure: new Error('synthetic failure') });
  const repository = harness.create();
  await assert.rejects(repository.listHoldings(), /تعذّر تحميل النسخ/);
  assert.deepEqual(harness.writes, []);
});

test('the existing branch loader consumes the shared reader and retains fields used by the staff UI', async t => {
  if (!requireFeature(t)) return;
  const branch = { id: 'branch-1', name: 'فرع اختباري', governorate: 'بورسعيد', city: 'مدينة اختبار', public_address: 'عنوان تجريبي', public_phone: '0000000000', public_email: 'test@example.invalid', is_published: true };
  let repositoryCalls = 0;
  let legacyCalls = 0;
  const repository = { async listBranches() { repositoryCalls += 1; return [branch]; } };
  const branchEditSelect = { value: '', innerHTML: '' };
  const requestSourceBranchSelect = { value: '', innerHTML: '' };
  const staffBranchesNode = { value: '', innerHTML: '' };
  const branchSelects = [{ value: '' }];
  const selectors = {
    '#branchEditSelect': branchEditSelect,
    '#requestSourceBranchSelect': requestSourceBranchSelect,
    '#staffBranches': staffBranchesNode,
  };
  const $ = selector => selectors[selector];
  const $$ = selector => selector === '[data-branch-select]' ? branchSelects : [];
  const legacySupabase = { from() {
    legacyCalls += 1;
    return { select() { return { eq() { return { order: async () => ({ data: [], error: null }) }; } }; } };
  } };
  const loader = new Function('staffLibraryRepository', 'supabase', '$', '$$', 'escapeHtml', 'updateBranchFilter', 'renderAutomationTasks', 'publicBranches', 'currentLibraryId', `
    let staffBranches = [];
    let branchLoadFailed = false;
    ${extractFunction(app, 'async function loadStaffBranches()')}
    return { load: loadStaffBranches, getState: () => ({ staffBranches, branchLoadFailed }) };
  `)(repository, legacySupabase, $, $$, value => String(value ?? ''), () => {}, () => {}, [], 'library-A');
  await loader.load();
  assert.equal(repositoryCalls, 1);
  assert.equal(legacyCalls, 0);
  assert.deepEqual(loader.getState(), { staffBranches: [branch], branchLoadFailed: false });
  assert.match(staffBranchesNode.innerHTML, /مدينة اختبار/);
});

test('the existing inventory loader consumes the shared title and holding reads', async t => {
  if (!requireFeature(t)) return;
  const titles = [{ id: 'title-1', general_number: 'SYN-1', title: 'عنوان اصطناعي', author: 'كاتب اختباري', classification: '٠٠٠', isbn: '', series_name: '', is_published: false }];
  const holdings = [{ id: 'holding-1', title_id: 'title-1', branch_id: 'branch-1', inventory_tag: 'SYN-COPY', cabinet_code: '١', shelf_code: '٢', public_shelf_label: '', status: 'available', created_at: '2026-01-01T00:00:00Z' }];
  const calls = [];
  const repository = {
    async listCatalogTitles() { calls.push('titles'); return titles; },
    async listHoldings() { calls.push('holdings'); return holdings; },
  };
  let legacyCalls = 0;
  const legacySupabase = { from() { legacyCalls += 1; throw new Error('legacy query should not run'); } };
  const tbody = { innerHTML: '' };
  const holdingRows = { innerHTML: '' };
  const selects = new Map(['reservationTitleSelect', 'holdingTitleSelect', 'requestMatchedTitleSelect'].map(id => [id, { value: '', innerHTML: '' }]));
  const $ = selector => selector === '#inventoryRows' ? tbody
    : selector === '#holdingRows' ? holdingRows
      : selector.startsWith('#') ? selects.get(selector.slice(1)) || null : null;
  const fetchAllPages = async () => { legacyCalls += 1; return []; };
  const loader = new Function('staffLibraryRepository', 'supabase', 'fetchAllPages', '$', 'escapeHtml', 'renderInventoryTitles', 'renderAutomationTasks', 'staffBranches', 'currentRole', `
    let inventoryTitles = [];
    let inventoryHoldings = [];
    let inventoryLoadFailed = false;
    ${extractFunction(app, 'async function loadInventory()')}
    return { load: loadInventory, getState: () => ({ inventoryTitles, inventoryHoldings, inventoryLoadFailed }) };
  `)(repository, legacySupabase, fetchAllPages, $, value => String(value ?? ''), () => {}, () => {}, [{ id: 'branch-1', name: 'فرع اختباري' }], 'reporter');
  await loader.load();
  assert.deepEqual(calls, ['titles', 'holdings']);
  assert.equal(legacyCalls, 0);
  assert.deepEqual(loader.getState(), { inventoryTitles: titles, inventoryHoldings: holdings, inventoryLoadFailed: false });
  assert.match(holdingRows.innerHTML, /عنوان اصطناعي/);
});
