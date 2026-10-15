const HEADER_ALIASES = {
  general_number: ['general_number', 'general number', 'local general number', 'local number', 'رقم عام', 'الرقم العام', 'الرقم العام المحلي', 'الرقم المحلي', 'رقم المكتبة'],
  title: ['title', 'book title', 'عنوان', 'العنوان', 'عنوان الكتاب', 'اسم الكتاب'],
  author: ['author', 'book author', 'المؤلف', 'اسم المؤلف'],
  classification: ['classification', 'dewey', 'dewey decimal', 'dewey classification', 'تصنيف', 'التصنيف', 'تصنيف ديوي', 'ديوي', 'رقم ديوي'],
  isbn: ['isbn', 'isbn10', 'isbn13', 'رقم isbn', 'رقم isbn الدولي', 'الرقم الدولي للكتاب'],
  series_name: ['series', 'series name', 'series_name', 'السلسلة', 'اسم السلسلة'],
  branch: ['branch', 'branch name', 'library branch', 'الفرع', 'اسم الفرع'],
  inventory_tag: ['inventory tag', 'copy number', 'copy barcode', 'copy tag', 'رقم النسخة', 'باركود النسخة', 'رقم جرد النسخة'],
  cabinet_code: ['cabinet', 'cabinet code', 'الخزانة', 'الدولاب', 'رقم الدولاب'],
  shelf_code: ['shelf', 'shelf code', 'الرف', 'الرف الداخلي', 'رقم الرف'],
  public_shelf_label: ['public shelf label', 'public shelf', 'shelf label', 'وصف الرف العام', 'مكان الرف للزوار', 'موقع الرف العام'],
  is_published: ['published', 'is published', 'publish', 'النشر العام', 'منشور للعامة', 'نشر للعامة'],
};

const normalizeHeader = value => String(value ?? '')
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
  .replace(/\u0640/g, '')
  .toLocaleLowerCase('ar-EG')
  .replace(/[^\p{L}\p{N}]+/gu, '');

const ALIASES_BY_KEY = new Map(Object.entries(HEADER_ALIASES)
  .flatMap(([key, aliases]) => aliases.map(alias => [normalizeHeader(alias), key])));

function isBlankRow(row) {
  return !Array.isArray(row) || row.every(value => String(value ?? '').trim() === '');
}

function detectDelimiter(text) {
  const counts = new Map([['\t', 0], [',', 0], [';', 0]]);
  let quoted = false;
  for (let i = 0; i < text.length && text[i] !== '\n' && text[i] !== '\r'; i += 1) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"' && quoted) { i += 1; continue; }
    if (char === '"') quoted = !quoted;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export function parseDelimitedText(source) {
  const text = String(source ?? '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const matrix = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) { row.push(cell); cell = ''; continue; }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (!isBlankRow(row)) matrix.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (!isBlankRow(row)) matrix.push(row);
  return matrix;
}

export function parseBookImportMatrix(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex(row => !isBlankRow(row));
  if (headerIndex < 0) return { rows: [], missingRequired: ['general_number', 'title'], ignoredHeaders: [] };

  const headers = rows[headerIndex].map(value => String(value ?? '').trim());
  const fieldIndexes = new Map();
  const ignoredHeaders = [];
  headers.forEach((header, index) => {
    const field = ALIASES_BY_KEY.get(normalizeHeader(header));
    if (!field) {
      if (header) ignoredHeaders.push(header);
      return;
    }
    if (!fieldIndexes.has(field)) fieldIndexes.set(field, index);
  });

  const missingRequired = ['general_number', 'title'].filter(key => !fieldIndexes.has(key));
  const mappedRows = rows.slice(headerIndex + 1).flatMap((source, offset) => {
    if (isBlankRow(source)) return [];
    const item = { source_row: headerIndex + offset + 2 };
    for (const [field, index] of fieldIndexes) item[field] = String(source[index] ?? '').trim();
    return [item];
  });
  return { rows: mappedRows, missingRequired, ignoredHeaders };
}

export function parsePublishedCell(value) {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (['1', 'true', 'yes', 'y', 'public', 'published', 'نعم', 'ايوه', 'منشور', 'منشورة'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'private', 'draft', 'داخلي', 'غيرمنشور', 'غيرمنشورة', 'لا'].includes(text)) return false;
  return null;
}

export const BOOK_IMPORT_MAX_ROWS = 5000;
export const BOOK_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
