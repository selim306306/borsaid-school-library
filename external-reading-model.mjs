const ALLOWED_HOSTS = new Set([
  'hindawi.org',
  'safahat.org',
  'aco.dlib.nyu.edu',
  'mc.dlib.nyu.edu',
  'ar.wikisource.org',
  'loc.gov',
  'www.aseeralkotb.com',
  'magazine.raspberrypi.com',
  'greenteapress.com',
  'allendowney.github.io',
  'chrismayfield.github.io',
  'inventwithpython.com',
  'automatetheboringstuff.com',
  'openstax.org',
  'storyweaver.org.in',
  'gutenberg.org',
  'standardebooks.org',
  'oreilly.com',
  'creativecommons.org',
]);

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const LANGUAGE_NAMES = new Map([
  ['ar', 'العربية'], ['ara', 'العربية'], ['en', 'الإنجليزية'], ['eng', 'الإنجليزية'],
  ['fr', 'الفرنسية'], ['fra', 'الفرنسية'], ['fre', 'الفرنسية'], ['es', 'الإسبانية'],
  ['spa', 'الإسبانية'], ['de', 'الألمانية'], ['deu', 'الألمانية'], ['ger', 'الألمانية'],
  ['it', 'الإيطالية'], ['ita', 'الإيطالية'], ['tr', 'التركية'], ['tur', 'التركية'],
  ['fa', 'الفارسية'], ['fas', 'الفارسية'], ['per', 'الفارسية'], ['ur', 'الأردية'], ['urd', 'الأردية'],
  ['ru', 'الروسية'], ['rus', 'الروسية'], ['zh', 'الصينية'], ['zho', 'الصينية'], ['chi', 'الصينية'],
  ['ja', 'اليابانية'], ['jpn', 'اليابانية'], ['ko', 'الكورية'], ['kor', 'الكورية'],
]);
for (const [name, code] of [['arabic','ar'],['english','en'],['french','fr'],['spanish','es'],['german','de'],['italian','it'],['turkish','tr'],['persian','fa'],['urdu','ur'],['russian','ru'],['chinese','zh'],['japanese','ja'],['korean','ko']]) LANGUAGE_NAMES.set(name, LANGUAGE_NAMES.get(code));
const LANGUAGE_ALIASES = new Map([...LANGUAGE_NAMES].flatMap(([code, label]) => [[code, code], [label.toLocaleLowerCase(), code]]));
const UNKNOWN_LANGUAGE = new Set(['unknown', 'und', 'undefined', 'n/a', 'mul', 'غير معروف', 'غير معروفة']);
const LANGUAGE_SEPARATOR = /[,،;|]/;

export function normalizeArabic(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/[ى]/g, 'ي').replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي').replace(/ـ/g, '').replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit))).toLocaleLowerCase('ar').trim().replace(/\s+/g, ' ');
}

export function isAllowedExternalUrl(value, { currentOrigin } = {}) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim(), currentOrigin || 'https://example.invalid');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    return [...ALLOWED_HOSTS].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function asArray(value) { return Array.isArray(value) ? value : value == null || value === '' ? [] : [value]; }
function languageCode(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const key = text.toLocaleLowerCase();
  if (key === 'العربية') return 'ar';
  if (key === 'الإنجليزية') return 'en';
  if (key === 'الفرنسية') return 'fr';
  if (key === 'الإسبانية') return 'es';
  if (key === 'الألمانية') return 'de';
  if (key === 'الإيطالية') return 'it';
  if (key === 'التركية') return 'tr';
  if (key === 'الفارسية') return 'fa';
  if (key === 'الأردية') return 'ur';
  if (key === 'الروسية') return 'ru';
  if (key === 'الصينية') return 'zh';
  if (key === 'اليابانية') return 'ja';
  if (key === 'الكورية') return 'ko';
  if (key === 'arabic') return 'ar';
  if (key === 'english') return 'en';
  if (key === 'french') return 'fr';
  if (key === 'spanish') return 'es';
  if (key === 'german') return 'de';
  if (key === 'italian') return 'it';
  if (key === 'turkish') return 'tr';
  if (key === 'persian') return 'fa';
  if (key === 'urdu') return 'ur';
  if (key === 'russian') return 'ru';
  if (key === 'chinese') return 'zh';
  if (key === 'japanese') return 'ja';
  if (key === 'korean') return 'ko';
  return LANGUAGE_ALIASES.get(key) || (/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(text) ? text.toLowerCase() : '');
}

/** Returns stable ISO-ish codes, supplied labels first, and an explicit ambiguity flag. */
export function normalizeLanguageMetadata(raw = {}) {
  const codes = [];
  const suppliedLabels = [];
  const suppliedByCode = new Map();
  const languagesPresent = Array.isArray(raw.languages);
  const addCode = (value) => { const code = languageCode(value); if (code && !codes.includes(code)) codes.push(code); return code; };
  const split = (value) => String(value ?? '').split(LANGUAGE_SEPARATOR).map((item) => item.trim()).filter(Boolean);
  for (const value of asArray(raw.languageCodes).flatMap(split)) addCode(value);
  for (const value of asArray(raw.languages)) {
    if (value && typeof value === 'object') {
      const label = String(value.language || value.name || value.label || '').trim();
      const code = addCode(value.code || value.languageCode || '');
      if (label) { suppliedLabels.push(label); if (code) suppliedByCode.set(code, label); }
    } else { const label = String(value ?? '').trim(); if (label) suppliedLabels.push(label); }
  }
  let explicitUnknown = Boolean(raw.languageUnknown);
  if (!languagesPresent) {
    for (const value of asArray(raw.language).flatMap(split)) {
      const code = addCode(value);
      if (UNKNOWN_LANGUAGE.has(value.toLocaleLowerCase())) explicitUnknown = true;
      else if (!code) suppliedLabels.push(value);
    }
  }
  const labels = [];
  const addLabel = (value) => { const label = String(value ?? '').trim(); if (label && !labels.includes(label)) labels.push(label); };
  for (const label of suppliedLabels) addLabel(label);
  // Supplied language labels already describe every documented language; ISO codes remain metadata, not extra categories.
  if (!labels.length) for (const code of codes) addLabel(suppliedByCode.get(code) || LANGUAGE_NAMES.get(code) || (UNKNOWN_LANGUAGE.has(code) ? 'غير معروفة' : code));
  const knownLabels = labels.filter((label) => !UNKNOWN_LANGUAGE.has(label.toLocaleLowerCase()));
  const languageUnknown = explicitUnknown || !knownLabels.length || (codes.length > 0 && codes.every((code) => UNKNOWN_LANGUAGE.has(code)));
  const languages = languageUnknown ? ['غير معروفة'] : knownLabels;
  return { languageCodes: [...new Set(codes)], languages, language: languageUnknown ? 'غير معروفة' : languages.join('، '), languageUnknown };
}

export function sanitizeBook(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const book = {};
  for (const key of ['id', 'title', 'author', 'subject', 'category', 'kind', 'sourceName', 'rights', 'publicationPlace', 'publicationYear', 'availability', 'completionStatus', 'recordType', 'seriesId', 'seriesTitle', 'publisher', 'isbn', 'pages']) book[key] = typeof raw[key] === 'string' ? raw[key].trim() : raw[key] == null ? '' : String(raw[key]).trim();
  if (Number.isInteger(raw.seriesOrder) && raw.seriesOrder > 0) book.seriesOrder = raw.seriesOrder;
  Object.assign(book, normalizeLanguageMetadata(raw));
  book.source = isAllowedExternalUrl(raw.source, options) ? raw.source.trim() : '';
  book.reader = isAllowedExternalUrl(raw.reader, options) ? raw.reader.trim() : '';
  book.pdf = isAllowedExternalUrl(raw.pdf, options) ? raw.pdf.trim() : '';
  book.rightsUrl = isAllowedExternalUrl(raw.rightsUrl, options) ? raw.rightsUrl.trim() : '';
  const sourceOnly = raw.recordType === 'sourceonly' || raw.availability === 'catalog-only';
  if (sourceOnly) {
    if (!book.kind || !book.rights || !book.source) return null;
    book.availability = 'catalog-only';
    book.reader = ''; book.pdf = '';
    if (!book.rightsUrl) book.rightsUrl = book.source;
  } else {
    book.availability = book.reader ? (book.availability || 'fulltext') : (book.availability || 'catalog-only');
  }
  book.searchable = raw.searchable === true || normalizeArabic(raw.searchable) === 'true' || normalizeArabic(raw.searchable) === 'نعم';
  if (!book.id || !book.title || !book.sourceName || !book.source || !book.rights) return null;
  if (!sourceOnly && !book.reader) return null;
  if (!book.completionStatus) book.completionStatus = sourceOnly ? 'سجل فهرسة فقط؛ لم تتحقق قراءة كاملة أو PDF' : 'قراءة كاملة متحققة من المصدر';
  return book;
}

export function sanitizeBooks(data, options = {}) { return Array.isArray(data) ? data.map(item => sanitizeBook(item, options)).filter(Boolean) : []; }

export function filterBooks(books, { query = '', subject = '', source = '', language = '', kind = '', availability = '' } = {}) {
  const words = normalizeArabic(query).split(/\s+/).filter(Boolean);
  return books.filter(book => {
    const searchable = [book.title, book.author, book.subject, book.category, book.sourceName, book.publicationPlace, book.language, ...(book.languages || []), ...(book.languageCodes || []), book.kind, book.seriesTitle ? `سلسلة ${book.seriesTitle}` : '', book.publisher, book.isbn].map(normalizeArabic).join(' ');
    return (!words.length || words.every(word => searchable.includes(word))) && (!subject || normalizeArabic(book.category || book.subject) === normalizeArabic(subject)) && (!source || normalizeArabic(book.sourceName) === normalizeArabic(source)) && (!language || (book.languageCodes || []).includes(language) || (book.languages || []).includes(language) || book.language === language) && (!kind || book.kind === kind) && (!availability || (availability === 'catalog-only' ? book.availability === 'catalog-only' : book.availability !== 'catalog-only'));
  });
}

export function uniqueValues(books, key) { return [...new Set(books.map(book => String(book[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')); }
export function countUniqueTitles(books) { return new Set(books.map(book => normalizeArabic(book.title)).filter(Boolean)).size; }
export function languageDistribution(books, { deduplicateBy = 'title' } = {}) {
  const titlesByLanguage = new Map();
  for (const book of books) {
    const metadata = normalizeLanguageMetadata(book);
    const identity = deduplicateBy === 'id' ? (String(book.id || '').trim() || `local:${normalizeArabic(book.title)}`) : normalizeArabic(book.title);
    if (!identity) continue;
    for (const language of metadata.languages) {
      if (!titlesByLanguage.has(language)) titlesByLanguage.set(language, new Set());
      titlesByLanguage.get(language).add(identity);
    }
  }
  return [...titlesByLanguage].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], 'ar')).map(([language, titles]) => ({ language, count: titles.size }));
}


const EXCLUDED_COMPLETE = /chapter|فصل|مخطوط|دورية|بحث|ورقة/i;
function isReadableRecord(book) { return book?.availability !== 'catalog-only' && Boolean(book?.reader || book?.pdf); }
function uniqueIdentity(records, fallbackTitle = false) {
  const seen = new Set();
  for (const item of records || []) { const key = String(item?.id || '').trim() || (fallbackTitle ? normalizeArabic(item?.title) : ''); if (key) seen.add(key); }
  return seen;
}
export function countIndexedMaterials(local = [], reading = [], catalog = []) {
  const all = [...(local || []), ...(reading || []), ...(catalog || [])];
  const ids = uniqueIdentity(all, true);
  const readingTitles = new Set(all.filter(isReadableRecord).map(b => normalizeArabic(b.title)).filter(Boolean));
  const complete = new Set(all.filter(b => isReadableRecord(b) && /كتاب|مجلد|جزء/.test(String(b.kind || '')) && !EXCLUDED_COMPLETE.test(String(b.kind || '')) && !['manuscript', 'periodical', 'research', 'paper'].includes(b.recordType)).map(b => normalizeArabic(b.title)).filter(Boolean));
  const periodicals = uniqueIdentity(all.filter(b => b.recordType === 'periodical' || /دورية/.test(String(b.kind || ''))), true).size;
  const catalogOnly = all.filter(b => b.availability === 'catalog-only').length;
  const readable = all.filter(isReadableRecord);
  return { indexedRecords: ids.size, readingTitles: readingTitles.size, completeBooks: complete.size, periodicals, catalogOnly, total: new Set(readable.map(b => normalizeArabic(b.title)).filter(Boolean)).size, online: new Set(readable.filter(b => b.reader || b.pdf).map(b => normalizeArabic(b.title)).filter(Boolean)).size, pdf: new Set(readable.filter(b => b.pdf).map(b => normalizeArabic(b.title)).filter(Boolean)).size };
}

export { ALLOWED_HOSTS };
