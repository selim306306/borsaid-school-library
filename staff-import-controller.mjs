import { BOOK_IMPORT_MAX_BYTES, BOOK_IMPORT_MAX_ROWS, parseBookImportMatrix, parseDelimitedText, parsePublishedCell } from './staff-import.mjs?v=644ac9f4f499a253';

const $ = (selector, root = document) => root.querySelector(selector);
const normalizeText = value => String(value ?? '').normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/\u0640/g, '')
  .replace(/\s+/g, ' ').trim().toLocaleLowerCase('ar-EG');

function safeXlsxLabel(value) {
  return String(value || '').replace(/[<>]/g, '').slice(0, 120);
}

export function initializeBookImportControls({
  getSupabase,
  getLibraryId,
  getRole,
  getBranches,
  getTitles,
  normalizeDeweyNumber,
  normalizeCatalogIsbn,
  escapeHtml,
  csvCell,
  onImported,
}) {
  const fileInput = $('#bookImportFile');
  const prepareButton = $('#prepareBookImport');
  const confirmButton = $('#confirmBookImport');
  const preview = $('#bookImportPreview');
  const status = $('#bookImportStatus');
  const defaultBranch = $('#bookImportDefaultBranch');
  if (!fileInput || !prepareButton || !confirmButton || !preview || !status || !defaultBranch) return;

  let selectedFile = null;
  let preparedImport = null;
  let ambiguousOutcome = false;

  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = `book-import-status${kind ? ` ${kind}` : ''}`;
  };

  function clearPreview() {
    preparedImport = null;
    ambiguousOutcome = false;
    preview.hidden = true;
    $('#bookImportSummary').textContent = '';
    $('#bookImportIssueCount').textContent = '';
    $('#bookImportIssues').replaceChildren();
    $('#bookImportPreviewRows').replaceChildren();
    confirmButton.disabled = true;
    confirmButton.textContent = 'تنفيذ الاستيراد';
  }

  function downloadTemplate() {
    const columns = ['الرقم العام', 'عنوان الكتاب', 'المؤلف', 'تصنيف ديوي', 'ISBN', 'اسم السلسلة', 'الفرع', 'رقم النسخة', 'الدولاب', 'الرف الداخلي', 'وصف الرف العام', 'النشر العام'];
    const csv = `\ufeff${columns.map(csvCell).join(',')}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'borsaid-book-import-template.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function loadXlsxLibrary() {
    if (window.XLSX?.read && window.XLSX?.utils?.sheet_to_json) return window.XLSX;
    if (!window.__borsaidXlsxPromise) {
      window.__borsaidXlsxPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./assets/vendor/xlsx.full.min.js?v=cc015130aa8521e7', import.meta.url).href;
        script.async = true;
        script.onload = () => window.XLSX?.read ? resolve(window.XLSX) : reject(new Error('تعذّر تهيئة قارئ Excel.'));
        script.onerror = () => reject(new Error('تعذّر تحميل قارئ Excel المحلي.'));
        document.head.append(script);
      }).catch(error => {
        delete window.__borsaidXlsxPromise;
        throw error;
      });
    }
    return window.__borsaidXlsxPromise;
  }

  async function readSpreadsheet(file) {
    if (file.size > BOOK_IMPORT_MAX_BYTES) throw new Error('حجم الملف يتجاوز 10 ميغابايت.');
    const extension = file.name.toLocaleLowerCase('en-US').split('.').pop();
    if (extension === 'csv') {
      const bytes = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch {
        try { text = new TextDecoder('windows-1256').decode(bytes); }
        catch { throw new Error('تعذّر فك ترميز CSV؛ احفظه بترميز UTF-8 ثم أعد المحاولة.'); }
      }
      return parseDelimitedText(text);
    }
    if (!['xlsx', 'xls'].includes(extension)) throw new Error('اختر ملف Excel بامتداد .xlsx أو .xls، أو ملف .csv.');
    const XLSX = await loadXlsxLibrary();
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: 'array', sheetRows: BOOK_IMPORT_MAX_ROWS + 2,
      cellFormula: false, cellHTML: false, cellStyles: false,
    });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) throw new Error('لا توجد ورقة عمل في الملف.');
    return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      header: 1, defval: '', raw: false, blankrows: false,
    });
  }

  function resolveBranch(rawValue, branches, fallbackId) {
    const raw = String(rawValue || '').trim();
    const value = raw || fallbackId;
    if (!value) return null;
    const byId = branches.find(branch => branch.id === value);
    if (byId) return byId;
    const normalized = normalizeText(value);
    return branches.find(branch => normalizeText(branch.name) === normalized) || null;
  }

  function validateRows(parsed, branches, titles) {
    const branchFallback = defaultBranch.value;
    const existingByNumber = new Map(titles.map(title => [String(title.general_number || '').trim(), title]));
    const rows = parsed.rows.map(source => {
      const errors = [];
      const generalNumber = String(source.general_number || '').trim();
      const title = String(source.title || '').trim();
      const author = String(source.author || '').trim();
      const rawDewey = String(source.classification || '').trim();
      const classification = rawDewey ? normalizeDeweyNumber(rawDewey) : '';
      const rawIsbn = String(source.isbn || '').trim();
      const isbn = rawIsbn ? normalizeCatalogIsbn(rawIsbn) : '';
      const seriesName = String(source.series_name || '').trim();
      const branch = resolveBranch(source.branch, branches, branchFallback);
      const rawPublished = String(source.is_published || '').trim();
      const parsedPublished = parsePublishedCell(rawPublished);
      const published = parsedPublished ?? false;

      if (!generalNumber || generalNumber.length > 80) errors.push('الرقم العام مطلوب وبحد أقصى 80 حرفاً');
      if (!title || title.length > 240) errors.push('العنوان مطلوب وبحد أقصى 240 حرفاً');
      if (author.length > 180) errors.push('المؤلف يتجاوز 180 حرفاً');
      if (rawDewey && !classification) errors.push('رمز ديوي غير صحيح');
      if (rawIsbn && !isbn) errors.push('ISBN غير صحيح');
      if (seriesName.length > 240) errors.push('اسم السلسلة يتجاوز 240 حرفاً');
      if (!branch) errors.push('حدد فرعاً موجوداً في المكتبة المختارة');
      if (rawPublished && parsedPublished === null) errors.push('قيمة النشر يجب أن تكون نعم أو لا');
      const record = {
        general_number: generalNumber,
        title,
        author: author || null,
        classification: classification || null,
        isbn: isbn || null,
        series_name: seriesName || null,
        branch_id: branch?.id || null,
        branch_name: branch?.name || '',
        inventory_tag: String(source.inventory_tag || '').trim() || null,
        cabinet_code: String(source.cabinet_code || '').trim() || null,
        shelf_code: String(source.shelf_code || '').trim() || null,
        public_shelf_label: String(source.public_shelf_label || '').trim() || null,
        is_published: published,
      };
      for (const [key, max] of [['inventory_tag', 100], ['cabinet_code', 80], ['shelf_code', 80], ['public_shelf_label', 120]]) {
        if (record[key] && record[key].length > max) errors.push(`${key === 'inventory_tag' ? 'رقم النسخة' : key === 'cabinet_code' ? 'الدولاب' : key === 'shelf_code' ? 'الرف' : 'وصف الرف العام'} يتجاوز الحد المسموح`);
      }
      return { source_row: source.source_row, record, errors };
    });

    const groups = new Map();
    for (const row of rows) {
      const key = row.record.general_number;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const [generalNumber, group] of groups) {
      const conflictFields = [
        ['title', 'العنوان'], ['author', 'المؤلف'], ['classification', 'ديوي'],
        ['isbn', 'ISBN'], ['series_name', 'السلسلة'],
      ];
      for (const [field, label] of conflictFields) {
        const values = [...new Set(group.map(row => normalizeText(row.record[field])).filter(Boolean))];
        if (values.length > 1) group.forEach(row => row.errors.push(`الرقم العام ${generalNumber} مرتبط بأكثر من قيمة لـ${label}`));
      }
      if (new Set(group.map(row => row.record.is_published)).size > 1) {
        group.forEach(row => row.errors.push(`اختيار النشر غير موحّد للرقم العام ${generalNumber}`));
      }
      const existing = existingByNumber.get(generalNumber);
      if (existing) {
        const first = group[0].record;
        const mismatch = normalizeText(existing.title) !== normalizeText(first.title)
          || (first.author && normalizeText(existing.author) !== normalizeText(first.author))
          || (first.classification && normalizeText(existing.classification) !== normalizeText(first.classification))
          || (first.isbn && normalizeText(existing.isbn) !== normalizeText(first.isbn))
          || (first.series_name && normalizeText(existing.series_name) !== normalizeText(first.series_name));
        if (mismatch) group.forEach(row => row.errors.push('هذا الرقم العام مسجل ببيانات كتاب مختلفة؛ عدّل الرقم أو حدّث السجل يدوياً أولاً'));
      } else {
        const canonical = Object.fromEntries(conflictFields.map(([field]) => [field, group.map(row => row.record[field]).find(Boolean) || null]));
        group.forEach(row => { Object.assign(row.record, canonical); });
      }
    }
    return rows;
  }

  function showPreview(rows, parsed) {
    const errors = rows.flatMap(row => row.errors.map(error => `الصف ${row.source_row}: ${error}`));
    const uniqueTitles = new Set(rows.map(row => row.record.general_number).filter(Boolean)).size;
    $('#bookImportSummary').textContent = `${rows.length.toLocaleString('ar-EG')} صفاً · ${uniqueTitles.toLocaleString('ar-EG')} عنواناً محلياً`;
    $('#bookImportIssueCount').textContent = errors.length ? `${errors.length.toLocaleString('ar-EG')} ملاحظة تمنع الحفظ` : 'كل الصفوف جاهزة';
    const issueMessages = errors.slice(0, 20);
    if (errors.length > 20) issueMessages.push(`وتوجد ${errors.length - 20} ملاحظة إضافية؛ لم يُخفَ أي خطأ عن قرار الحفظ.`);
    if (parsed.ignoredHeaders.length) issueMessages.push(`أعمدة غير معروفة ستُتجاهل: ${parsed.ignoredHeaders.map(safeXlsxLabel).join('، ')}`);
    $('#bookImportIssues').innerHTML = issueMessages.map(message => `<li>${escapeHtml(message)}</li>`).join('');
    $('#bookImportPreviewRows').innerHTML = rows.slice(0, 12).map(row => {
      const r = row.record;
      const state = row.errors.length ? `<span class="book-import-row-error">${escapeHtml(row.errors[0])}</span>` : '<span class="book-import-row-ok">جاهز</span>';
      return `<tr><td>${row.source_row}</td><td>${escapeHtml(r.general_number)}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.branch_name || '—')}</td><td>${escapeHtml(r.inventory_tag || '—')}</td><td>${state}</td></tr>`;
    }).join('');
    preview.hidden = false;
    preparedImport = { rows, parsed, errors };
    confirmButton.disabled = errors.length > 0 || !rows.length || getRole() !== 'owner' && getRole() !== 'admin' && getRole() !== 'librarian';
    confirmButton.textContent = errors.length ? 'أصلح الملاحظات قبل الاستيراد' : `استيراد ${rows.length.toLocaleString('ar-EG')} نسخة`;
    if (rows.length > 12) setStatus(`المعاينة تعرض أول 12 صفاً؛ فُحصت جميع الصفوف وعددها ${rows.length.toLocaleString('ar-EG')}.`, errors.length ? 'error' : '');
    else setStatus(errors.length ? 'لم يُحفظ أي سجل. عالج الملاحظات ثم اختر الملف مجدداً.' : 'المعاينة جاهزة. لم يُحفظ أي سجل بعد.', errors.length ? 'error' : '');
  }

  $('#downloadBookImportTemplate').addEventListener('click', downloadTemplate);
  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files?.[0] || null;
    clearPreview();
    prepareButton.disabled = !selectedFile;
    setStatus(selectedFile ? `تم اختيار ${safeXlsxLabel(selectedFile.name)}. اضغط قراءة الملف لمعاينته.` : '');
  });
  prepareButton.addEventListener('click', async () => {
    clearPreview();
    if (!selectedFile) return setStatus('اختر ملف Excel أو CSV أولاً.', 'error');
    if (!getLibraryId() || !['owner', 'admin', 'librarian'].includes(getRole())) return setStatus('الاستيراد متاح لمالك المكتبة أو مسؤولها أو أمينها فقط.', 'error');
    prepareButton.disabled = true;
    setStatus('جارٍ قراءة الملف محلياً والتحقق من صفوفه…');
    try {
      const matrix = await readSpreadsheet(selectedFile);
      const parsed = parseBookImportMatrix(matrix);
      if (parsed.missingRequired.length) throw new Error('لم أتعرف على عمودي الرقم العام المحلي وعنوان الكتاب. نزّل القالب أو صحح أسماء الأعمدة.');
      if (!parsed.rows.length) throw new Error('الملف لا يحتوي صفوف كتب بعد صف العناوين.');
      if (parsed.rows.length > BOOK_IMPORT_MAX_ROWS) throw new Error(`الحد الأقصى ${BOOK_IMPORT_MAX_ROWS.toLocaleString('ar-EG')} صف في الملف الواحد.`);
      const rows = validateRows(parsed, getBranches(), getTitles());
      showPreview(rows, parsed);
    } catch (error) {
      clearPreview();
      setStatus(error instanceof Error ? error.message : 'تعذّرت قراءة الملف. تحقق من تنسيقه ثم أعد المحاولة.', 'error');
    } finally {
      prepareButton.disabled = !selectedFile;
    }
  });
  confirmButton.addEventListener('click', async () => {
    if (!preparedImport || preparedImport.errors.length || ambiguousOutcome) return;
    const libraryId = getLibraryId();
    const supabase = getSupabase();
    if (!libraryId || !supabase || !['owner', 'admin', 'librarian'].includes(getRole())) return setStatus('انتهت صلاحية الجلسة أو تغيرت المكتبة؛ سجّل الدخول وتحقق من المكتبة المحددة.', 'error');
    const rows = preparedImport.rows.map(({ record }) => ({
      general_number: record.general_number,
      title: record.title,
      author: record.author,
      classification: record.classification,
      isbn: record.isbn,
      series_name: record.series_name,
      branch_id: record.branch_id,
      inventory_tag: record.inventory_tag,
      cabinet_code: record.cabinet_code,
      shelf_code: record.shelf_code,
      public_shelf_label: record.public_shelf_label,
      is_published: record.is_published,
    }));
    confirmButton.disabled = true;
    prepareButton.disabled = true;
    setStatus(`جارٍ إرسال ${rows.length.toLocaleString('ar-EG')} نسخة إلى ${safeXlsxLabel($('#librarySelect')?.selectedOptions?.[0]?.textContent || 'المكتبة المحددة')} كوحدة واحدة…`);
    try {
      const { data, error } = await supabase.rpc('import_titles_with_holdings', { p_library_id: libraryId, p_rows: rows });
      if (error) {
        if (!error.code) {
          ambiguousOutcome = true;
          return setStatus('تعذّر تأكيد نتيجة الاتصال. لم يُعاد إرسال الملف؛ حدّث الجرد وافحص السجلات قبل أي محاولة جديدة.', 'error');
        }
        confirmButton.disabled = false;
        return setStatus('لم يُستورد أي صف؛ أُلغيت الدفعة بالكامل. راجع صلاحية الدور، وتطابق البيانات، وفروع المكتبة، وعدم تكرار الرقم العام.', 'error');
      }
      if (Number(data) !== rows.length) {
        ambiguousOutcome = true;
        return setStatus('وصل رد غير مكتمل؛ لا تعاود الاستيراد قبل تحديث الجرد والتأكد من عدد النسخ المسجلة.', 'error');
      }
      preparedImport = null;
      selectedFile = null;
      fileInput.value = '';
      clearPreview();
      setStatus(`تم استيراد ${Number(data).toLocaleString('ar-EG')} نسخة. لم تُنشأ بيانات مستعيرين أو سجلات إعارة.`, 'success');
      await onImported();
    } catch {
      ambiguousOutcome = true;
      setStatus('انقطع الاتصال قبل تأكيد نتيجة الاستيراد. لم تُعَد المحاولة تلقائياً؛ حدّث الجرد وافحص السجلات أولاً.', 'error');
    } finally {
      if (!ambiguousOutcome) {
        prepareButton.disabled = !selectedFile;
        if (preparedImport) confirmButton.disabled = preparedImport.errors.length > 0;
      }
    }
  });
}
