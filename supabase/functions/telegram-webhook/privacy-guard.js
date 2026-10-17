function normalizeArabic(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .toLowerCase();
}

const GENERIC_ROLE_FOLLOWUPS = new Set([
  'في', 'من', 'على', 'الى', 'عن', 'مع', 'لدى', 'عند', 'الذي', 'التي', 'يمكن', 'يمكنهم',
  'ممكن', 'يقرأ', 'تقرأ', 'يقرأون', 'يقرؤون', 'يبحث', 'تبحث', 'يبحثون', 'استعار',
  'استعارت', 'يستعير', 'تستعير', 'يريد', 'تريد', 'يحتاج', 'تحتاج', 'عايز', 'عايزة',
  'عاوز', 'عاوزة', 'مدرسة', 'المدرسة', 'مكتبة', 'الكتاب', 'كتب', 'عندكم', 'يعمل',
  'تعمل', 'يستخدم', 'تستخدم', 'يساعد', 'تساعد', 'يستطيع', 'تستطيع', 'يستطيعون',
  'للقراءة', 'للعمل', 'فيها', 'لديه', 'لديها', 'قراءة', 'للمكتبة', 'للمدرسة',
  'مواعيد', 'عن', 'استخدام', 'خدمات', 'يحق', 'له', 'لها', 'مسؤوليات', 'المكتبة',
].map(normalizeArabic));

const GENERIC_ENGLISH_FOLLOWUPS = new Set([
  'in', 'at', 'on', 'who', 'can', 'could', 'may', 'has', 'have', 'is', 'are', 'reads',
  'read', 'searches', 'needs', 'wants', 'using', 'uses', 'use', 'books', 'library',
  'the', 'a', 'an', 'with', 'for', 'to', 'from', 'his', 'her', 'their', 'services',
  'responsibilities', 'responsibility', 'allowed', 'help', 'work', 'borrow', 'borrower',
]);

const ARABIC_PERSON_ROLE = '(?:الط(?:الب|لاب)(?:ة|ات)?|التلميذ(?:ة|ين|ات)?|المستعير(?:ين|ون|ة|ات)?|الموظف(?:ين|ون|ة|ات)?|العامل(?:ين|ون|ة|ات)?|المعلم(?:ين|ون|ة|ات)?|المدير(?:ين|ون|ة|ات)?|العضو(?:ة|اء)?|امين\\s+المكتبة|امينة\\s+المكتبة)';
const ARABIC_PRIVATE_ATTRIBUTE = '(?:اسم|رقم|بيانات|معلومات|سجل|حالة|درجة|درجات|علامة|نتيجة|حضور|غياب|غيابه|مرض|صحة|راتب|ملف|شكوى|مخالفة|تأديب|عنوان|هاتف|موبايل|جوال|بريد|كلمة\\s*(?:المرور|السر)|رمز\\s*(?:التحقق|الدخول|الوصول)|مفتاح\\s*(?:api|سري))';
const ENGLISH_PERSON_ROLE = '(?:students?|pupils?|borrowers?|members?|employees?|teachers?|staff|librarians?)';
const ENGLISH_PRIVATE_ATTRIBUTE = '(?:name|number|id|record|status|grade|score|attendance|absence|health|medical|salary|file|complaint|address|phone|email|password|verification code|api\\s*key|secret)';

export function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function hasNamedSensitivePersonReference(value) {
  const normalized = normalizeArabic(value);
  const rolePattern = /(?:الط(?:الب|لاب)(?:ة|ات)?|التلميذ(?:ة|ين|ات)?|المستعير(?:ين|ون|ة|ات)?|الموظف(?:ين|ون|ة|ات)?|العامل(?:ين|ون|ة|ات)?|المعلم(?:ين|ون|ة|ات)?|المدير(?:ين|ون|ة|ات)?|العضو(?:ة|اء)?|امين\s+المكتبة|امينة\s+المكتبة)\s+([\p{L}]{2,})/gu;
  for (const match of normalized.matchAll(rolePattern)) {
    if (!GENERIC_ROLE_FOLLOWUPS.has(normalizeArabic(match[1]))) return true;
  }
  const englishRolePattern = /\b(?:students?|pupils?|borrowers?|members?|employees?|teachers?|staff|librarians?)\s+([A-Za-z][A-Za-z'-]{1,})/gi;
  for (const match of String(value).matchAll(englishRolePattern)) {
    if (!GENERIC_ENGLISH_FOLLOWUPS.has(match[1].toLowerCase())) return true;
  }
  return /(?:اسمي|اسمه|اسمها|اسم\s+(?:الطالب|الطالبة|الطلاب|المستعير|الموظف|المعلمة))\s+[\p{L}]{2,}/u.test(normalized)
    || /(?:ابني|ابنتي|طفلي|طفلتي|اخي|اختي|صديقي|صديقتي)\s+[\p{L}]{2,}/u.test(normalized)
    || /[\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2}\s+(?:رقمه|رقمها|هاتفه|هاتفها|درجته|درجاته|غيابه|راتبه|ملفه|اعارته)/u.test(normalized)
    || /[\p{L}]{2,}(?:\s+[\p{L}]{2,}){0,2}\s+(?:استعار|استعارت|استلف|حجز(?:ه|ها)?|اعاد|ارجع)/u.test(normalized)
    || hasNamedLoanReference(normalized)
    || /\b(?:my name is|i am)\s+[A-Z][a-z]+/i.test(value)
    || /\bmy\s+(?:child|student|borrower|employee|colleague)\s+is\s+[A-Z][a-z]+/i.test(value)
    || /\b[A-Z][a-z]+(?:'s)?\s+(?:loan|borrowing|checkout|reservation)\s+(?:record|status|history|details)\b/i.test(value)
    || /\b(?:loan|borrowing|checkout|reservation)\s+(?:record|status|history|details)\s+(?:for|of)\s+[A-Z][a-z]+/i.test(value);
}

function hasNamedLoanReference(normalizedValue) {
  const match = /(?:تفاصيل|سجل|بيانات|حالة)\s+(?:ال)?(?:اعارة|استعارة)\s+(?:الخاصة\s+ب)?([\p{L}]{2,})/u.exec(normalizedValue);
  if (!match) return false;
  return !new Set(['الكتاب', 'الكتب', 'كتاب', 'شروط', 'نظام', 'خدمات', 'المكتبة', 'مكتبة']).has(match[1]);
}

function hasPrivatePersonAttributes(value) {
  const arabic = normalizeArabic(value);
  const arabicContext = new RegExp(`(?:${ARABIC_PERSON_ROLE})[^.!?؟\\n]{0,60}(?:${ARABIC_PRIVATE_ATTRIBUTE})|(?:${ARABIC_PRIVATE_ATTRIBUTE})[^.!?؟\\n]{0,60}(?:${ARABIC_PERSON_ROLE})`, 'u');
  const englishContext = new RegExp(`\\b(?:${ENGLISH_PERSON_ROLE})\\b[^.!?\\n]{0,80}\\b(?:${ENGLISH_PRIVATE_ATTRIBUTE})\\b|\\b(?:${ENGLISH_PRIVATE_ATTRIBUTE})\\b[^.!?\\n]{0,80}\\b(?:${ENGLISH_PERSON_ROLE})\\b`, 'i');
  return arabicContext.test(arabic) || englishContext.test(value);
}

export function containsSensitivePersonalData(value) {
  const text = String(value);
  const normalized = normalizeDigits(text);
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /(?:\+?20)?0?1[0125]\d{8}/.test(normalized.replace(/\D/g, ''))
    || /\b\d{8,}\b/.test(normalized)
    || /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text)
    || /(?:student\s+(?:name|number|record)|member\s+(?:id|number)|loan\s+record|password|verification\s+code|api\s*key|secret\s*key)/i.test(text)
    || /(?:كلمة\s*(?:المرور|السر)|رمز\s*(?:التحقق|الدخول|الوصول)|مفتاح\s*(?:api|سري)|بيانات\s*الدخول)/iu.test(text)
    || /(?:مين|من)\s+(?:الذي\s+)?(?:استعار|يستعير|استلف|حجز|حُجز|عليه\s+إعارة)/u.test(normalizeArabic(text))
    || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:borrowed|checked out|reserved|returned)\b/i.test(text)
    || /\b(?:students?|borrowers?|employees?|staff)\b[^.!?\n]{0,50}\b(?:borrowed|checked out|reserved|loan\s+(?:record|status|history))\b/i.test(text)
    || /\bwho\s+(?:borrowed|checked out|reserved|has a loan|is overdue)\b/i.test(text)
    || hasPrivatePersonAttributes(text)
    || hasNamedSensitivePersonReference(text);
}
