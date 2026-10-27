const PAGE_SIZE = 20;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ar-EG').trim();
}

export function mountCataloging({ root, repository, openExistingPanel }) {
  if (!root || !repository || typeof openExistingPanel !== 'function') {
    throw new TypeError('root, repository, and openExistingPanel are required');
  }

  let destroyed = false;
  let revision = 0;
  let loading = false;
  let rows = [];
  let query = '';
  let page = 0;
  let status = 'اختر تحديثًا لقراءة عناوين المكتبة.';

  function filteredRows() {
    const search = normalize(query);
    if (!search) return rows;
    return rows.filter(row => [
      row.general_number, row.title, row.author, row.classification, row.isbn, row.series_name,
    ].some(value => normalize(value).includes(search)));
  }

  function render() {
    if (destroyed) return;
    const filtered = filteredRows();
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(page, 0), pages - 1);
    const start = page * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    const body = visible.map(row => `<tr>
      <td data-label="الرقم العام">${escapeHtml(row.general_number || '—')}</td>
      <td data-label="عنوان الكتاب">${escapeHtml(row.title || '—')}</td>
      <td data-label="المؤلف">${escapeHtml(row.author || '—')}</td>
      <td data-label="ديوي">${escapeHtml(row.classification || '—')}</td>
    </tr>`).join('');
    const empty = filtered.length
      ? ''
      : `<p class="staff-library-empty">${query ? 'لا توجد عناوين تطابق البحث.' : 'لا توجد عناوين مسجلة في هذه المكتبة.'}</p>`;
    const summary = filtered.length
      ? `عرض ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} من ${filtered.length} عنوان`
      : `${rows.length} عنوان مطابق`;
    root.innerHTML = `<section class="staff-library-module staff-library-cataloging" aria-label="الفهرسة">
      <div class="staff-library-module-toolbar">
        <div class="staff-library-search-field"><label for="staffLibraryCatalogSearch">ابحث في الفهرس</label><input id="staffLibraryCatalogSearch" type="search" autocomplete="off" value="${escapeHtml(query)}" placeholder="العنوان أو المؤلف أو الرقم"></div>
        <button type="button" class="button button-soft" data-experiment-action="refresh" ${loading ? 'disabled' : ''}>${loading ? 'جارٍ التحديث…' : 'تحديث العناوين'}</button>
      </div>
      <p class="staff-library-status" role="status" aria-live="polite">${escapeHtml(status)}${filtered.length ? ` · ${escapeHtml(summary)}` : ''}</p>
      ${filtered.length ? `<div class="staff-library-table-wrap" role="region" aria-label="نتائج الفهرس"><table class="staff-library-table"><thead><tr><th scope="col">الرقم العام</th><th scope="col">عنوان الكتاب</th><th scope="col">المؤلف</th><th scope="col">ديوي</th></tr></thead><tbody>${body}</tbody></table></div>` : empty}
      ${filtered.length > PAGE_SIZE ? `<nav class="staff-library-pagination" aria-label="صفحات الفهرس"><button type="button" class="button button-outline" data-page-step="-1" ${page === 0 ? 'disabled' : ''}>السابق</button><span>صفحة ${page + 1} من ${pages}</span><button type="button" class="button button-outline" data-page-step="1" ${page + 1 >= pages ? 'disabled' : ''}>التالي</button></nav>` : ''}
      <div class="staff-library-module-actions"><button type="button" class="button button-primary" data-existing-panel="catalogPanel">فتح الفهرس الأصلي للتعديل</button><span>هذه الوحدة للعرض فقط.</span></div>
    </section>`;
    root.hidden = false;
  }

  async function refresh() {
    if (destroyed) return;
    const request = ++revision;
    loading = true;
    rows = [];
    status = 'جارٍ تحميل العناوين…';
    render();
    try {
      if (typeof repository.listCatalogTitles !== 'function') throw new Error('catalog read unavailable');
      const result = await repository.listCatalogTitles();
      if (destroyed || request !== revision) return;
      rows = Array.isArray(result) ? result : [];
      status = rows.length ? `اكتمل تحميل ${rows.length} عنوانًا.` : 'لا توجد عناوين مسجلة.';
    } catch {
      if (destroyed || request !== revision) return;
      rows = [];
      status = 'تعذّر تحميل العناوين. تحقق من الاتصال ثم أعد المحاولة.';
    }
    loading = false;
    page = 0;
    render();
  }

  function handleInput(event) {
    if (event.target?.id !== 'staffLibraryCatalogSearch') return;
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
