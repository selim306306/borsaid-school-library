const ALLOWED_ROLES = new Set(['owner', 'admin', 'librarian']);
const PANEL_ID = 'requestsPanel';

export function mount({ root, getRole, openExistingPanel }) {
  if (!root || typeof getRole !== 'function' || typeof openExistingPanel !== 'function') throw new TypeError('root, getRole, and openExistingPanel are required');
  let destroyed = false;
  const allowed = () => ALLOWED_ROLES.has(getRole());
  if (allowed()) {
    root.hidden = false;
    root.innerHTML = `<section class="staff-library-module staff-library-operational" aria-label="الطلبات بين المكتبات"><h3>طلبات المكتبات</h3><p>تُراجع الطلبات وتُعالج في الشاشة الأصلية، حيث تبقى صلاحيات المكتبة وسير العمل كما هي.</p><button type="button" class="button button-primary" data-existing-panel="${PANEL_ID}">فتح شاشة الطلبات الأصلية</button></section>`;
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
