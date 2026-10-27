import { mountCataloging } from './staff-library-modules/cataloging.mjs?v=3df568d2b8f4d756';
import { mountInventory } from './staff-library-modules/inventory.mjs?v=6acf97a9f6f80fac';
import { mount as mountCirculation } from './staff-library-modules/circulation.mjs?v=da63bced4856bf3b';
import { mount as mountReservations } from './staff-library-modules/reservations.mjs?v=e99c494d1a963847';
import { mount as mountInterlibrary } from './staff-library-modules/interlibrary.mjs?v=99315569af5d999a';
import { mount as mountReports } from './staff-library-modules/reports.mjs?v=87b4cf59b925a1e9';
import { mount as mountImports } from './staff-library-modules/imports.mjs?v=5e7b44e9083d50ac';

const ROLE_MODULES = Object.freeze({
  owner: Object.freeze(['cataloging', 'inventory', 'circulation', 'reservations', 'interlibrary', 'reports', 'imports']),
  admin: Object.freeze(['cataloging', 'inventory', 'circulation', 'reservations', 'interlibrary', 'reports', 'imports']),
  librarian: Object.freeze(['cataloging', 'inventory', 'circulation', 'reservations', 'interlibrary', 'reports', 'imports']),
  circulation: Object.freeze(['cataloging', 'inventory', 'circulation', 'reservations', 'reports']),
  reporter: Object.freeze(['cataloging', 'inventory', 'reports']),
});

const MODULES = Object.freeze({
  cataloging: { label: 'الفهرسة', mount: mountCataloging, refreshable: true },
  inventory: { label: 'الجرد', mount: mountInventory, refreshable: true },
  circulation: { label: 'الإعارة', mount: mountCirculation },
  reservations: { label: 'الحجوزات', mount: mountReservations },
  interlibrary: { label: 'الطلبات', mount: mountInterlibrary },
  reports: { label: 'التقارير', mount: mountReports },
  imports: { label: 'استيراد الكتب', mount: mountImports },
});

export function isStaffLibraryExperimentRequested(search = '') {
  return new URLSearchParams(search).get('staffTab') === 'experiment';
}

export function getStaffLibraryExperimentModuleIds(role) {
  return ROLE_MODULES[role] ? [...ROLE_MODULES[role]] : [];
}

export function canUseStaffLibraryExperiment({ requested, userId, role }) {
  return requested === true && typeof userId === 'string' && userId.length > 0
    && getStaffLibraryExperimentModuleIds(role).length > 0;
}

export function initializeStaffLibraryExperiment({ root, getRole, openExistingPanel }) {
  if (!root || typeof getRole !== 'function' || typeof openExistingPanel !== 'function') {
    throw new TypeError('root, getRole, and openExistingPanel are required');
  }

  let repository = null;
  let destroyed = false;
  let selectedModule = 'cataloging';
  let activeController = null;

  function allowedModules() {
    return destroyed ? [] : getStaffLibraryExperimentModuleIds(getRole());
  }

  function destroyActiveModule() {
    activeController?.destroy();
    activeController = null;
  }

  function clear() {
    destroyActiveModule();
    root.innerHTML = '';
    root.hidden = true;
  }

  function renderShell() {
    const moduleIds = allowedModules();
    if (!moduleIds.length) {
      clear();
      return false;
    }
    if (!moduleIds.includes(selectedModule)) selectedModule = 'cataloging';
    const active = MODULES[selectedModule];
    const refreshButton = active.refreshable
      ? '<button type="button" class="button button-soft" data-module-refresh>تحديث</button>'
      : '';
    const tabs = moduleIds.map(moduleId => {
      const selected = selectedModule === moduleId;
      return `<button type="button" class="staff-library-experiment-tab" role="tab" id="staff-library-experiment-tab-${moduleId}" data-experiment-module="${moduleId}" aria-selected="${selected}" aria-controls="staffLibraryExperimentContent" tabindex="${selected ? '0' : '-1'}">${MODULES[moduleId].label}</button>`;
    }).join('');
    root.innerHTML = `<section class="staff-library-experiment" aria-label="تجربة المكتبة">
      <header class="staff-library-experiment-heading"><div><h3>تجربة المكتبة</h3><p>استعراض منفصل للموظفين. القراءة فقط؛ التعديل يتم في الشاشات الأصلية.</p></div><span class="staff-library-read-only">قراءة فقط</span>${refreshButton}</header>
      <nav class="staff-library-experiment-tabs" role="tablist" aria-label="وحدات المكتبة التجريبية">${tabs}</nav>
      <div class="staff-library-experiment-content" id="staffLibraryExperimentContent" role="tabpanel" aria-labelledby="staff-library-experiment-tab-${selectedModule}" tabindex="0"><div data-experiment-module-root="${selectedModule}"></div></div>
    </section>`;
    root.hidden = false;
    return true;
  }

  function mountActiveModule() {
    if (destroyed || activeController) return activeController;
    const moduleIds = allowedModules();
    if (!moduleIds.includes(selectedModule)) return null;
    const moduleRoot = root.querySelector?.('[data-experiment-module-root]');
    if (!moduleRoot) return null;
    const descriptor = MODULES[selectedModule];
    activeController = descriptor.mount({
      root: moduleRoot,
      repository,
      getRole,
      openExistingPanel,
    });
    return activeController;
  }

  function refresh() {
    const moduleIds = allowedModules();
    if (!moduleIds.length) {
      clear();
      return undefined;
    }
    if (!moduleIds.includes(selectedModule)) {
      destroyActiveModule();
      selectedModule = 'cataloging';
      renderShell();
    }
    const controller = mountActiveModule();
    return typeof controller?.refresh === 'function' ? controller.refresh() : undefined;
  }

  function selectModule(moduleId) {
    if (!allowedModules().includes(moduleId)) return;
    if (selectedModule === moduleId && activeController) return;
    destroyActiveModule();
    selectedModule = moduleId;
    renderShell();
    const controller = mountActiveModule();
    if (typeof controller?.refresh === 'function') void controller.refresh();
  }

  function handleClick(event) {
    const tab = event.target?.closest?.('[data-experiment-module]');
    if (tab) {
      selectModule(tab.dataset.experimentModule);
      return;
    }
    const refreshButton = event.target?.closest?.('[data-module-refresh]');
    if (refreshButton) void refresh();
  }

  function handleKeydown(event) {
    const tab = event.target?.closest?.('[data-experiment-module]');
    if (!tab) return;
    const moduleIds = allowedModules();
    const currentIndex = moduleIds.indexOf(tab.dataset.experimentModule);
    if (currentIndex < 0 || moduleIds.length < 2) return;
    const isRtl = root.ownerDocument?.documentElement?.dir === 'rtl' || root.dir === 'rtl';
    const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const previousKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
    let nextIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = moduleIds.length - 1;
    else if (event.key === nextKey) nextIndex = (currentIndex + 1) % moduleIds.length;
    else if (event.key === previousKey) nextIndex = (currentIndex - 1 + moduleIds.length) % moduleIds.length;
    else return;
    event.preventDefault?.();
    selectModule(moduleIds[nextIndex]);
    root.querySelector?.(`[data-experiment-module="${moduleIds[nextIndex]}"]`)?.focus?.();
  }

  root.addEventListener('click', handleClick);
  root.addEventListener('keydown', handleKeydown);

  function setRepository(nextRepository) {
    if (destroyed) return;
    destroyActiveModule();
    repository = nextRepository || null;
    selectedModule = 'cataloging';
    renderShell();
  }

  if (allowedModules().length) renderShell();
  else clear();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    repository = null;
    root.removeEventListener('click', handleClick);
    root.removeEventListener('keydown', handleKeydown);
    clear();
  }

  return { setRepository, refresh, destroy };
}
