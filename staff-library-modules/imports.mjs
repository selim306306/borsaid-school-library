const ALLOWED_ROLES = new Set(['owner', 'admin', 'librarian']);
const PANEL_ID = 'catalogPanel';

export function mount({ root, getRole, openExistingPanel }) {
  if (!root || typeof getRole !== 'function' || typeof openExistingPanel !== 'function') throw new TypeError('root, getRole, and openExistingPanel are required');
  let destroyed = false;
  const allowed = () => ALLOWED_ROLES.has(getRole());
  if (allowed()) {
    root.hidden = false;
    root.innerHTML = `<section class="staff-library-module staff-library-operational" aria-label="استيراد الكتب"><h3>استيراد الكتب</h3><p>تظل معاينة ملفات CSV وExcel والتحقق والحفظ في الشاشة الأصلية؛ لا ترفع هذه التجربة ملفات ولا تحفظ بيانات.</p><button type="button" class="button button-primary" data-existing-panel="${PANEL_ID}">فتح استيراد الكتب الأصلي</button></section>`;
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
