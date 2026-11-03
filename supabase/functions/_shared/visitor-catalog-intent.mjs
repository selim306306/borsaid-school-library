const CATALOG_SIGNAL_PATTERNS = [
  /(?:ابحث|دور|هات|اعثر|فتش)\s+(?:لي\s+)?(?:عن\s+)?/u,
  /(?:في|داخل|ب(?:الفهرس|المكتبه|المكتبة))\s+(?:ال)?(?:فهرس|بحث)/u,
  /(?:هل\s+)?(?:يوجد|عندكم|لديكم|متوفر|موجود)\s+(?:كتاب|كتب|عنوان|نسخه)/u,
  /(?:من\s+(?:هو\s+)?|اسم\s+)?مؤلف(?:\s+(?:كتاب|الكتاب))?\s+\S+/u,
  /(?:كتاب|الكتاب)\s+.+\s+(?:لمن|لـ|ل|تأليف)/u,
  /(?:كتاب|كتب|عنوان|مؤلف|مؤلفه|مؤلف\s+الكتاب|فهرس|نسخه|نسخ)\s+(?:عن|باسم|اسمه|ل|من|في|هو|هي)/u,
  /(?:رقم|مكان|رف|نسخ)\s+(?:الكتاب|العنوان)/u,
];

const GENERAL_CATALOG_GUIDANCE = /(?:كيف|ازاي|إزاي|طريقة|طرق|استخدام|استخدم)\s+(?:ابحث|البحث|أبحث)|(?:كيف|ازاي|إزاي)\s+استخدم\s+(?:الموقع|الفهرس)/u;
const GENERIC_BOOK_REFERENCE = /^(?:ال)?(?:كتاب|الكتب|عنوان|العنوان|المؤلف|الفهرس|النسخة)$/u;

function normalizeCatalogText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar')
    .trim();
}

export function classifyVisitorCatalogIntent(question) {
  const normalized = normalizeCatalogText(question);
  if (!normalized) return { kind: 'general', query: '' };
  if (GENERAL_CATALOG_GUIDANCE.test(normalized)) return { kind: 'general', query: '' };
  if (CATALOG_SIGNAL_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { kind: 'search', query: normalized.slice(0, 100) };
  }
  // A bare title/name is ambiguous: do not turn it into an unsolicited RPC search.
  if (normalized.split(' ').length >= 2 && !/[؟?]/u.test(String(question))) {
    return { kind: 'clarify', query: normalized.slice(0, 100) };
  }
  if (GENERIC_BOOK_REFERENCE.test(normalized)) return { kind: 'clarify', query: normalized };
  return { kind: 'general', query: '' };
}

export function isClearVisitorCatalogSearch(question) {
  return classifyVisitorCatalogIntent(question).kind === 'search';
}
