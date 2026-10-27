const ALLOWED_ROLES = new Set(['owner', 'admin', 'librarian', 'circulation', 'reporter']);
const PANEL_ID = 'reportsPanel';

export function mount({ root, getRole, openExistingPanel }) {
  if (!root || typeof getRole !== 'function' || typeof openExistingPanel !== 'function') throw new TypeError('root, getRole, and openExistingPanel are required');
  let destroyed = false;
  const allowed = () => ALLOWED_ROLES.has(getRole());
  if (allowed()) {
    root.hidden = false;
    root.innerHTML = `<section class="staff-library-module staff-library-operational" aria-label="التقارير"><h3>تقارير المكتبة</h3><p>تُعرض التقارير المجمعة في اللوحة الأصلية فقط؛ لا تنشئ هذه التجربة تقارير جديدة أو تعرض سجلات فردية.</p><button type="button" class="button button-primary" data-existing-panel="${PANEL_ID}">فتح التقارير الأصلية</button></section>`;
  } else {
    root.hidden = true;
    root.innerHTML = '';
  }
  function handleClick(event) {
    const target = event.target?.closest?.('[data-existing-panel]');
    if (!destroyed && allowed() && target?.dataset.existingPanel === PANEL_ID) openExistingPanel(PANEL_ID);
  }
  root.addEventListener('click', handleClick);
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('click', handleClick);
      root.innerHTML = '';
      root.hidden = true;
    },
  };
}
