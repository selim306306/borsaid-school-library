const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const DEWEY_MAIN_CLASSES = new Set(['000', '100', '200', '300', '400', '500', '600', '700', '800', '900']);

function westernDigits(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/gu, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/gu, digit => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function normalizeCatalogIsbn(value) {
  const isbn = westernDigits(value).replace(/[\s-]/gu, '').toUpperCase();
  if (/^\d{13}$/u.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? isbn : '';
  }
  if (/^\d{9}[\dX]$/u.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit === 'X' ? 10 : digit) * (10 - index), 0);
    return sum % 11 === 0 ? isbn : '';
  }
  return '';
}

function trustedIsbnContext(label, isbn) {
  if (/(?:رقم\s*(?:ال[إا]يداع|العدد|الجزء|المجلد)|الطبعة|deposit|issue|edition|volume)/iu.test(label)) return false;
  if (/(?:\bISBN\b|ردمك|تدمك)/iu.test(label)) return true;
  return isbn.length === 13 ? /^(?:978|979)/u.test(isbn) : /^977/u.test(isbn);
}

function localNumberLabel(label) {
  return /(?:رقم\s*(?:عام|المكتبة|الجرد|الاقتناء|الإضافة)|accession|library\s*(?:general|accession))/iu.test(label);
}

function depositNumberLabel(label) {
  return /(?:رقم\s*ال[إا]يداع|deposit\s*number)/iu.test(label);
}

function normalizePrintedNumbers(values) {
  if (!Array.isArray(values)) return [];
  const allowedKinds = new Set(['isbn', 'local_general_number', 'deposit_number', 'issue_number', 'edition_number', 'volume_number', 'other']);
  return values.slice(0, 12).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const label = String(item.label || '').trim().slice(0, 60);
    const rawValue = String(item.value || '').trim().slice(0, 80);
    let kind = allowedKinds.has(item.kind) ? item.kind : 'other';
    if (!rawValue) return [];
    if (kind === 'isbn') {
      const isbn = normalizeCatalogIsbn(rawValue);
      if (!isbn || !trustedIsbnContext(label, isbn)) kind = 'other';
      else return [{ kind, label: label || 'ISBN', value: isbn }];
    }
    if (kind === 'local_general_number' && !localNumberLabel(label)) kind = 'other';
    if (kind === 'deposit_number' && !depositNumberLabel(label)) kind = 'other';
    return [{ kind, label: label || 'رقم مطبوع', value: rawValue }];
  });
}

export function mapCoverAnalysisNumbers(data, currentValues = {}) {
  const numbers = normalizePrintedNumbers(data?.printed_numbers);
  const isbnCandidates = [...new Set(numbers.filter(item => item.kind === 'isbn').map(item => item.value))];
  const localNumberCandidates = [...new Set(numbers.filter(item => item.kind === 'local_general_number').map(item => item.value))];
  const fills = {};
  if (!String(currentValues.isbn || '').trim() && isbnCandidates.length === 1) fills.isbn = isbnCandidates[0];
  if (!String(currentValues.general_number || '').trim() && localNumberCandidates.length === 1) fills.general_number = localNumberCandidates[0];
  const classification = String(data?.classification || '').trim();
  if (!String(currentValues.classification || '').trim() && DEWEY_MAIN_CLASSES.has(classification)) fills.classification = classification;
  return {
    numbers,
    fills,
    choices: {
      isbn: isbnCandidates.length > 1 && !String(currentValues.isbn || '').trim() ? isbnCandidates : [],
      general_number: localNumberCandidates.length > 1 && !String(currentValues.general_number || '').trim() ? localNumberCandidates : [],
    },
  };
}

export function isValidDeweyMainClass(value) {
  return DEWEY_MAIN_CLASSES.has(String(value || '').trim());
}
