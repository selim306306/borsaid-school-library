const ALLOWED_HOSTS = new Set([
  'hindawi.org',
  'safahat.org',
  'aco.dlib.nyu.edu',
  'mc.dlib.nyu.edu',
  'ar.wikisource.org',
]);

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabic(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .toLocaleLowerCase('ar')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isAllowedExternalUrl(value, { currentOrigin } = {}) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim(), currentOrigin || 'https://example.invalid');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    return [...ALLOWED_HOSTS].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function sanitizeBook(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const book = {};
  for (const key of ['id', 'title', 'author', 'subject', 'category', 'language', 'kind', 'sourceName', 'rights', 'publicationPlace', 'publicationYear']) {
    book[key] = typeof raw[key] === 'string' ? raw[key].trim() : raw[key] == null ? '' : String(raw[key]).trim();
  }
  book.language ||= 'العربية';
  book.source = isAllowedExternalUrl(raw.source, options) ? raw.source.trim() : '';
  book.reader = isAllowedExternalUrl(raw.reader, options) ? raw.reader.trim() : '';
  book.pdf = isAllowedExternalUrl(raw.pdf, options) ? raw.pdf.trim() : '';
  book.rightsUrl = isAllowedExternalUrl(raw.rightsUrl, options) ? raw.rightsUrl.trim() : '';
  book.searchable = raw.searchable === true || normalizeArabic(raw.searchable) === 'true' || normalizeArabic(raw.searchable) === 'نعم';
  if (!book.id || !book.title || !book.sourceName || !book.source || !book.reader || !book.rights) return null;
  return book;
}

export function sanitizeBooks(data, options = {}) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => sanitizeBook(item, options)).filter(Boolean);
}

export function filterBooks(books, { query = '', subject = '', source = '' } = {}) {
  const needle = normalizeArabic(query);
  const subjectNeedle = normalizeArabic(subject);
  const sourceNeedle = normalizeArabic(source);
  return books.filter((book) => {
    const searchable = [book.title, book.author, book.subject, book.category, book.sourceName, book.publicationPlace].map(normalizeArabic).join(' ');
    return (!needle || needle.split(/\s+/).every(word => searchable.includes(word)))
      && (!subjectNeedle || normalizeArabic(book.category || book.subject) === subjectNeedle)
      && (!sourceNeedle || normalizeArabic(book.sourceName) === sourceNeedle);
  });
}

export function uniqueValues(books, key) {
  return [...new Set(books.map((book) => String(book[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
}

export { ALLOWED_HOSTS };
