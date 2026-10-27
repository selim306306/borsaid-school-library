import assert from 'node:assert/strict';
import test from 'node:test';

const feature = await import('../staff-library-experiment.mjs').catch(() => null);

function requireFeature(t) {
  if (feature) return true;
  assert.ok(feature, 'staff library experiment module should be available');
  t.skip('module not implemented yet');
  return false;
}

function createRoot() {
  const listeners = new Map();
  const moduleRoot = createBareRoot();
  let shell = '';
  const root = {
    hidden: true,
    get innerHTML() {
      return shell.replace(/(<div[^>]*data-experiment-module-root[^>]*>)[\s\S]*?(<\/div>)/u, (_match, opening, closing) => `${opening}${moduleRoot.innerHTML}${closing}`);
    },
    set innerHTML(value) { shell = value; moduleRoot.innerHTML = ''; },
    querySelector(selector) { return selector === '[data-experiment-module-root]' ? moduleRoot : null; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event) { listeners.get(type)?.(event); },
  };
  return root;
}

function createBareRoot() {
  const listeners = new Map();
  return {
    hidden: false,
    innerHTML: '',
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event) { listeners.get(type)?.(event); },
  };
}

function repository(rows) {
  return {
    calls: 0,
    async listCatalogTitles() {
      this.calls += 1;
      return rows;
    },
  };
}

test('the experiment needs the explicit URL flag, an authenticated user, and a known active staff role', t => {
  if (!requireFeature(t)) return;
  assert.equal(feature.isStaffLibraryExperimentRequested(''), false);
  assert.equal(feature.isStaffLibraryExperimentRequested('?staffTab=other'), false);
  assert.equal(feature.isStaffLibraryExperimentRequested('?staffTab=experiment'), true);
  assert.equal(feature.canUseStaffLibraryExperiment({ requested: false, userId: 'u-1', role: 'librarian' }), false);
  assert.equal(feature.canUseStaffLibraryExperiment({ requested: true, userId: null, role: 'librarian' }), false);
  assert.equal(feature.canUseStaffLibraryExperiment({ requested: true, userId: 'u-1', role: null }), false);
  assert.equal(feature.canUseStaffLibraryExperiment({ requested: true, userId: 'u-1', role: 'owner' }), true);
});

test('the experiment module access mirrors configureRole and omits the future catalog card', t => {
  if (!requireFeature(t)) return;
  const managerModules = ['cataloging', 'inventory', 'circulation', 'reservations', 'interlibrary', 'reports', 'imports'];
  for (const role of ['owner', 'admin', 'librarian']) assert.deepEqual(feature.getStaffLibraryExperimentModuleIds(role), managerModules);
  assert.deepEqual(feature.getStaffLibraryExperimentModuleIds('circulation'), ['cataloging', 'inventory', 'circulation', 'reservations', 'reports']);
  assert.deepEqual(feature.getStaffLibraryExperimentModuleIds('reporter'), ['cataloging', 'inventory', 'reports']);
  assert.ok([...feature.getStaffLibraryExperimentModuleIds('owner'), ...feature.getStaffLibraryExperimentModuleIds('reporter')].every(id => id !== 'index-card'));
  assert.deepEqual(feature.getStaffLibraryExperimentModuleIds(null), []);
  assert.deepEqual(feature.getStaffLibraryExperimentModuleIds('unknown-role'), []);
});

test('an unauthenticated viewer cannot render the experiment or read the repository', async t => {
  if (!requireFeature(t)) return;
  const root = createRoot();
  const data = repository([{ id: 't-1', general_number: 'X-1', title: 'عنوان اصطناعي' }]);
  const controller = feature.initializeStaffLibraryExperiment({
    root, getRole: () => null, openExistingPanel() {},
  });
  controller.setRepository(data);
  await controller.refresh();
  assert.equal(root.hidden, true);
  assert.equal(root.innerHTML, '');
  assert.equal(data.calls, 0);
});

test('authorized catalog reads start only on refresh and show the returned title', async t => {
  if (!requireFeature(t)) return;
  const root = createRoot();
  const data = repository([{ id: 't-1', general_number: 'SYN-001', title: 'عنوان اصطناعي للاختبار', author: 'مؤلف اختباري' }]);
  const controller = feature.initializeStaffLibraryExperiment({
    root, getRole: () => 'librarian', openExistingPanel() {},
  });
  controller.setRepository(data);
  assert.equal(data.calls, 0);
  await controller.refresh();
  assert.equal(data.calls, 1);
  assert.equal(root.hidden, false);
  assert.match(root.innerHTML, /عنوان اصطناعي للاختبار/);
  assert.match(root.innerHTML, /SYN-001/);
});

test('changing the repository clears the previous library result and empty reads stay empty', async t => {
  if (!requireFeature(t)) return;
  const root = createRoot();
  const first = repository([{ id: 't-a', general_number: 'A-1', title: 'عنوان المكتبة أ' }]);
  const second = repository([]);
  const controller = feature.initializeStaffLibraryExperiment({
    root, getRole: () => 'reporter', openExistingPanel() {},
  });
  controller.setRepository(first);
  await controller.refresh();
  assert.match(root.innerHTML, /عنوان المكتبة أ/);
  controller.setRepository(second);
  assert.doesNotMatch(root.innerHTML, /عنوان المكتبة أ/);
  assert.equal(second.calls, 0);
  await controller.refresh();
  assert.match(root.innerHTML, /لا توجد عناوين مسجلة/);
  assert.equal(second.calls, 1);
});

test('a role downgrade and destroy clear the experiment state before it can be reused', async t => {
  if (!requireFeature(t)) return;
  const root = createRoot();
  let role = 'owner';
  const data = repository([{ id: 't-1', general_number: 'SYN-002', title: 'عنوان سري اصطناعي' }]);
  const controller = feature.initializeStaffLibraryExperiment({
    root, getRole: () => role, openExistingPanel() {},
  });
  controller.setRepository(data);
  await controller.refresh();
  role = null;
  await controller.refresh();
  assert.equal(root.hidden, true);
  assert.doesNotMatch(root.innerHTML, /عنوان سري اصطناعي/);
  assert.equal(data.calls, 1);
  controller.destroy();
  assert.equal(root.hidden, true);
  assert.equal(root.innerHTML, '');
});


function eventTarget(dataset = {}, extra = {}) {
  const target = { dataset, ...extra };
  target.closest = () => target;
  return target;
}

test('each operational module routes only to its existing staff panel', async t => {
  const scenarios = [
    ['circulation', 'circulation', 'circulationPanel'],
    ['reservations', 'circulation', 'reservationsPanel'],
    ['interlibrary', 'librarian', 'requestsPanel'],
    ['reports', 'reporter', 'reportsPanel'],
    ['imports', 'owner', 'catalogPanel'],
  ];
  for (const [name, role, panelId] of scenarios) {
    const module = await import(`../staff-library-modules/${name}.mjs`).catch(() => null);
    assert.ok(module, `${name} module should be available`);
    if (!module) continue;
    const root = createRoot();
    const opened = [];
    const controller = module.mount({ root, getRole: () => role, openExistingPanel: id => opened.push(id) });
    assert.equal(root.hidden, false);
    root.dispatch('click', { target: eventTarget({ existingPanel: panelId }) });
    assert.deepEqual(opened, [panelId]);
    controller.destroy();
    assert.equal(root.hidden, true);
    assert.equal(root.innerHTML, '');
  }
});

test('manager-only operational modules stay hidden for a reporter', async t => {
  for (const name of ['interlibrary', 'imports']) {
    const module = await import(`../staff-library-modules/${name}.mjs`).catch(() => null);
    assert.ok(module, `${name} module should be available`);
    if (!module) continue;
    const root = createRoot();
    const opened = [];
    const controller = module.mount({ root, getRole: () => 'reporter', openExistingPanel: id => opened.push(id) });
    root.dispatch('click', { target: eventTarget({ existingPanel: name === 'imports' ? 'catalogPanel' : 'requestsPanel' }) });
    assert.equal(root.hidden, true);
    assert.equal(root.innerHTML, '');
    assert.deepEqual(opened, []);
    controller.destroy();
  }
});

test('cataloging is read-only, searchable, escaped, and links edits to the original panel', async t => {
  const module = await import('../staff-library-modules/cataloging.mjs').catch(() => null);
  assert.ok(module, 'cataloging module should be available');
  if (!module) return;
  const root = createRoot();
  const calls = [];
  const opened = [];
  const repository = {
    async listCatalogTitles() {
      calls.push('list');
      return [{ id: 'title-1', general_number: 'SYN-101', title: '<img src=x onerror=alert(1)>', author: 'مؤلف اختباري', classification: '٠٠٠' }];
    },
  };
  const controller = module.mountCataloging({ root, repository, openExistingPanel: id => opened.push(id) });
  assert.deepEqual(calls, []);
  await controller.refresh();
  assert.deepEqual(calls, ['list']);
  assert.match(root.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  root.dispatch('input', { target: eventTarget({}, { id: 'staffLibraryCatalogSearch', value: 'لا يوجد' }) });
  assert.match(root.innerHTML, /لا توجد عناوين تطابق البحث/);
  root.dispatch('click', { target: eventTarget({ existingPanel: 'catalogPanel' }) });
  assert.deepEqual(opened, ['catalogPanel']);
  controller.destroy();
  assert.equal(root.hidden, true);
});

test('cataloging communicates empty and failed reads and leaves a retry action', async t => {
  const module = await import('../staff-library-modules/cataloging.mjs').catch(() => null);
  assert.ok(module, 'cataloging module should be available');
  if (!module) return;
  const emptyRoot = createRoot();
  const emptyController = module.mountCataloging({ root: emptyRoot, repository: { async listCatalogTitles() { return []; } }, openExistingPanel() {} });
  await emptyController.refresh();
  assert.match(emptyRoot.innerHTML, /لا توجد عناوين مسجلة/);
  emptyController.destroy();
  const errorRoot = createRoot();
  const errorController = module.mountCataloging({ root: errorRoot, repository: { async listCatalogTitles() { throw new Error('synthetic failure'); } }, openExistingPanel() {} });
  await errorController.refresh();
  assert.match(errorRoot.innerHTML, /تعذّر تحميل العناوين/);
  assert.match(errorRoot.innerHTML, /data-experiment-action="refresh"/);
  errorController.destroy();
});

test('inventory reads titles, holdings, and branches without writes and shows original edit routing', async t => {
  const module = await import('../staff-library-modules/inventory.mjs').catch(() => null);
  assert.ok(module, 'inventory module should be available');
  if (!module) return;
  const root = createRoot();
  const calls = [];
  const opened = [];
  const repository = {
    async listCatalogTitles() { calls.push('titles'); return [{ id: 'title-1', general_number: 'SYN-202', title: 'عنوان نسخة اصطناعي' }]; },
    async listHoldings() { calls.push('holdings'); return [{ id: 'holding-1', title_id: 'title-1', branch_id: 'branch-1', inventory_tag: 'SYN-COPY', cabinet_code: '١', shelf_code: '٢', status: 'available' }]; },
    async listBranches() { calls.push('branches'); return [{ id: 'branch-1', name: 'فرع اختبار' }]; },
  };
  const controller = module.mountInventory({ root, repository, openExistingPanel: id => opened.push(id) });
  assert.deepEqual(calls, []);
  await controller.refresh();
  assert.deepEqual(calls, ['titles', 'holdings', 'branches']);
  assert.match(root.innerHTML, /عنوان نسخة اصطناعي/);
  assert.match(root.innerHTML, /SYN-COPY/);
  assert.match(root.innerHTML, /متاح/);
  assert.match(root.innerHTML, /data-existing-panel="catalogPanel"/);
  root.dispatch('input', { target: eventTarget({}, { id: 'staffLibraryInventorySearch', value: 'نسخة اصطناعي' }) });
  assert.match(root.innerHTML, /عنوان نسخة اصطناعي/);
  root.dispatch('input', { target: eventTarget({}, { id: 'staffLibraryInventorySearch', value: 'لا توجد' }) });
  assert.match(root.innerHTML, /لا توجد نسخ تطابق البحث/);
  assert.doesNotMatch(root.innerHTML, /data-inventory-result=/);
  root.dispatch('click', { target: eventTarget({ existingPanel: 'catalogPanel' }) });
  assert.deepEqual(opened, ['catalogPanel']);
  controller.destroy();
});

test('the module switcher exposes manager modules and supports keyboard navigation without retaining hidden routes', async t => {
  if (!requireFeature(t)) return;
  const root = createRoot();
  let role = 'librarian';
  const data = repository([]);
  const controller = feature.initializeStaffLibraryExperiment({ root, getRole: () => role, openExistingPanel() {} });
  controller.setRepository(data);
  assert.match(root.innerHTML, /data-experiment-module="imports"/);
  assert.doesNotMatch(root.innerHTML, /index-card/);
  let prevented = false;
  root.dispatch('keydown', { key: 'End', target: eventTarget({ experimentModule: 'cataloging' }), preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.match(root.innerHTML, /data-experiment-module="imports"[^>]*aria-selected="true"/);
  role = 'reporter';
  await controller.refresh();
  assert.doesNotMatch(root.innerHTML, /data-experiment-module="imports"/);
  assert.match(root.innerHTML, /data-experiment-module="reports"/);
  controller.destroy();
});
