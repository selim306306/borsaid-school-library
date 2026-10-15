export const PUBLIC_READABLE_BOOKS = Object.freeze([
  Object.freeze({
    title: 'حي بن يقظان',
    author: 'ابن طفيل',
    subject: 'فلسفة عربية، قصة رمزية، التفكير والملاحظة، التراث الأندلسي',
    language: 'العربية',
    kind: 'كتاب كامل',
    availability: 'PDF متاح للقراءة والتنزيل',
    pdf: 'hayy-ibn-yaqzan.pdf',
    source: 'https://ar.wikisource.org/wiki/حي_بن_يقظان',
  }),
  Object.freeze({
    title: 'رسالة الغفران',
    author: 'أبو العلاء المعري',
    subject: 'أدب عربي، نقد أدبي، شعر، رحلة تخيّلية، التراث العباسي',
    language: 'العربية',
    kind: 'الكتاب: الجزآن الأول والثاني',
    availability: 'PDF متاح للقراءة والتنزيل',
    pdf: 'risalat-al-ghufran.pdf',
    source: 'https://ar.wikisource.org/wiki/رسالة_الغفران',
  }),
  Object.freeze({
    title: 'كليلة ودمنة: باب الأسد والثور',
    author: 'عبد الله بن المقفع',
    subject: 'حكايات، حكم، قصص تراثية، تحليل الشخصيات، الأدب العربي',
    language: 'العربية',
    kind: 'فصل قصصي من الكتاب، وليس الكتاب كاملًا',
    availability: 'PDF متاح للقراءة والتنزيل',
    pdf: 'kalila-wa-dimna-lion-and-bull.pdf',
    source: 'https://ar.wikisource.org/wiki/كليلة_ودمنة/باب_الأسد_والثور_وهو_أول_الكتاب',
  }),
]);

const GENERIC_READING_TERMS = new Set([
  'هل', 'ممكن', 'عايز', 'عايزة', 'عاوز', 'عاوزة', 'اريد', 'ابحث', 'بحث',
  'عن', 'عندكم', 'عندك', 'يوجد', 'توجد', 'موجود', 'موجودة', 'فيه', 'كتاب',
  'الكتاب', 'كتب', 'الكتب', 'ملف', 'ملفات', 'pdf', 'بي', 'دي', 'اف', 'لو',
  'سمحت', 'فين', 'اين', 'ما', 'هو', 'هي', 'في', 'من', 'المكتبة', 'مكتبه',
  'مكتبات', 'تحميل', 'تنزيل', 'اقرا', 'قراءة', 'قراءه', 'اونلاين', 'انترنت',
  'الكتروني', 'الموقع', 'على', 'الرابط', 'روابط', 'رابط', 'متاح', 'متاحة',
  'القراءة', 'الرقمية', 'مصادر', 'عربي', 'عربية', 'مرخص', 'مرخصة', 'مجاني',
  'مجانية', 'هنا', 'دلوقتي', 'للقراءة', 'والتنزيل', 'والتحميل',
]);

export function normalizePublicReadingText(value = '') {
  return String(value).normalize('NFKD').replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ـ/g, '').toLowerCase().trim();
}

export function findPublicReadableBooks(query = '') {
  const normalized = normalizePublicReadingText(query);
  return PUBLIC_READABLE_BOOKS.filter(book => (
    normalized.includes(normalizePublicReadingText(book.title.split(':')[0]))
    || normalized.includes(normalizePublicReadingText(book.author))
  ));
}

function isGenericReadingTerm(term) {
  const withoutArticle = term.replace(/^[وفبكل]?ال/u, '');
  const withoutPrefix = term.replace(/^[وفبكل]/u, '');
  return [term, withoutArticle, withoutPrefix].some(candidate => GENERIC_READING_TERMS.has(candidate));
}

export function hasSpecificUnknownPublicReading(query = '', matches = findPublicReadableBooks(query)) {
  if (matches.length) return false;
  const normalized = normalizePublicReadingText(query);
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean).some(term => !isGenericReadingTerm(term));
}

export const PUBLIC_READING_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.ar';
