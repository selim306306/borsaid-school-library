const PAGE_SIZE = 20;
const STATUS_LABELS = Object.freeze({
  available: 'متاح',
  on_loan: 'معار',
  reserved: 'محجوز',
  maintenance: 'تحت الصيانة',
  lost: 'مفقود',
  withdrawn: 'مستبعد',
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ar-EG').trim();
}

export function mountInventory({ root, repository, openExistingPanel }) {
  if (!root || !repository || typeof openExistingPanel !== 'function') {
    throw new TypeError('root, repository, and openExistingPanel are required');
  }

  let destroyed = false;
  let revision = 0;
  let loading = false;
  let copies = [];
  let titles = [];
  let branches = [];
  let query = '';
  let page = 0;
  let status = 'اختر تحديثًا لقراءة النسخ المسجلة.';

  function viewRows() {
    const titleMap = new Map(titles.map(title => [title.id, title]));
    const branchMap = new Map(branches.map(branch => [branch.id, branch]));
    const search = normalize(query);
    return copies.map(copy => {
      const title = titleMap.get(copy.title_id) || {};
      const branch = branchMap.get(copy.branch_id) || {};
      const location = [copy.cabinet_code, copy.shelf_code, copy.public_shelf_label].filter(Boolean).join(' · ') || '—';
      const row = {
        title: title.title || 'عنوان غير متاح',
        generalNumber: title.general_number || '—',
        branch: branch.name || 'فرع غير متاح',
        tag: copy.inventory_tag || '—',
        status: STATUS_LABELS[copy.status] || String(copy.status || 'غير محدد'),
        location,
      };
      row.searchable = [row.title, row.generalNumber, row.branch, row.tag, row.status, row.location].map(normalize).join(' ');
      return row;
    }).filter(row => !search || row.searchable.includes(search));
  }

  function render() {
    if (destroyed) return;
    const filtered = viewRows();
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(page, 0), pages - 1);
    const start = page * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    const body = visible.map(row => `<tr>
      <td data-label="العنوان">${escapeHtml(row.title)}</td>
      <td data-label="الرقم العام">${escapeHtml(row.generalNumber)}</td>
      <td data-label="الفرع">${escapeHtml(row.branch)}</td>
      <td data-label="رقم النسخة">${escapeHtml(row.tag)}</td>
      <td data-label="الحالة"><span class="staff-library-status-tag">${escapeHtml(row.status)}</span></td>
      <td data-label="الموقع">${escapeHtml(row.location)}</td>
    </tr>`).join('');
    const empty = filtered.length
      ? ''
      : `<p class="staff-library-empty">${query ? 'لا توجد نسخ تطابق البحث.' : 'لا توجد نسخ مسجلة في هذه المكتبة.'}</p>`;
    const summary = filtered.length
      ? `عرض ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} من ${filtered.length} نسخة`
      : `${copies.length} نسخة مطابقة`;
    root.innerHTML = `<section class="staff-library-module staff-library-inventory" aria-label="الجرد">
      <div class="staff-library-module-toolbar">
        <div class="staff-library-search-field"><label for="staffLibraryInventorySearch">ابحث في النسخ</label><input id="staffLibraryInventorySearch" type="search" autocomplete="off" value="${escapeHtml(query)}" placeholder="العنوان أو الفرع أو رقم النسخة"></div>
        <button type="button" class="button button-soft" data-experiment-action="refresh" ${loading ? 'disabled' : ''}>${loading ? 'جارٍ التحديث…' : 'تحديث الجرد'}</button>
      </div>
      <p class="staff-library-status" role="status" aria-live="polite">${escapeHtml(status)}${filtered.length ? ` · ${escapeHtml(summary)}` : ''}</p>
      ${filtered.length ? `<div class="staff-library-table-wrap" role="region" aria-label="نسخ المكتبة"><table class="staff-library-table"><thead><tr><th scope="col">العنوان</th><th scope="col">الرقم العام</th><th scope="col">الفرع</th><th scope="col">رقم النسخة</th><th scope="col">الحالة</th><th scope="col">الموقع</th></tr></thead><tbody>${body}</tbody></table></div>` : empty}
      ${filtered.length > PAGE_SIZE ? `<nav class="staff-library-pagination" aria-label="صفحات الجرد"><button type="button" class="button button-outline" data-page-step="-1" ${page === 0 ? 'disabled' : ''}>السابق</button><span>صفحة ${page + 1} من ${pages}</span><button type="button" class="button button-outline" data-page-step="1" ${page + 1 >= pages ? 'disabled' : ''}>التالي</button></nav>` : ''}
      <div class="staff-library-module-actions"><button type="button" class="button button-primary" data-existing-panel="catalogPanel">فتح الجرد الأصلي</button><span>تسجيل نتائج الجرد متاح في الشاشة الأصلية فقط.</span></div>
    </section>`;
    root.hidden = false;
  }

  async function refresh() {
    if (destroyed) return;
    const request = ++revision;
    loading = true;
    copies = [];
    titles = [];
    branches = [];
    status = 'جارٍ تحميل النسخ والعناوين والفروع…';
    render();
    try {
      if (typeof repository.listCatalogTitles !== 'function' || typeof repository.listHoldings !== 'function' || typeof repository.listBranches !== 'function') {
        throw new Error('inventory reads unavailable');
      }
      const [nextTitles, nextCopies, nextBranches] = await Promise.all([
        repository.listCatalogTitles(),
        repository.listHoldings(),
        repository.listBranches(),
      ]);
      if (destroyed || request !== revision) return;
      titles = Array.isArray(nextTitles) ? nextTitles : [];
      copies = Array.isArray(nextCopies) ? nextCopies : [];
      branches = Array.isArray(nextBranches) ? nextBranches : [];
      status = copies.length ? `اكتمل تحميل ${copies.length} نسخة.` : 'لا توجد نسخ مسجلة.';
    } catch {
      if (destroyed || request !== revision) return;
      copies = [];
      titles = [];
      branches = [];
      status = 'تعذّر تحميل بيانات الجرد. تحقق من الاتصال ثم أعد المحاولة.';
    }
    loading = false;
    page = 0;
    render();
  }

  function handleInput(event) {
    if (event.target?.id !== 'staffLibraryInventorySearch') return;
    query = event.target.value || '';
    page = 0;
    render();
  }

  function handleClick(event) {
    const target = event.target?.closest?.('[data-experiment-action="refresh"], [data-page-step], [data-existing-panel]');
    if (!target) return;
    if (target.dataset.experimentAction === 'refresh') {
      void refresh();
      return;
    }
    if (target.dataset.pageStep) {
      page += Number(target.dataset.pageStep);
      render();
      return;
    }
    if (target.dataset.existingPanel === 'catalogPanel') openExistingPanel('catalogPanel');
  }

  root.addEventListener('input', handleInput);
  root.addEventListener('click', handleClick);
  render();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    revision += 1;
    root.removeEventListener('input', handleInput);
    root.removeEventListener('click', handleClick);
    root.innerHTML = '';
    root.hidden = true;
  }

  return { refresh, destroy };
}
