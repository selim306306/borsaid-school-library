function normalizeArabic(value) {
  return String(value).normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();
}

const GENERIC_ROLE_FOLLOWUPS = new Set([
  'في', 'من', 'على', 'الى', 'عن', 'مع', 'لدى', 'عند', 'الذي', 'التي', 'يمكن', 'يمكنهم',
  'ممكن', 'يقرأ', 'تقرأ', 'يقرأون', 'يقرؤون', 'يبحث', 'تبحث', 'يبحثون', 'استعار',
  'استعارت', 'يستعير', 'تستعير', 'يريد', 'تريد', 'يحتاج', 'تحتاج', 'عايز', 'عايزة',
  'عاوز', 'عاوزة', 'مدرسة', 'المدرسة', 'مكتبة', 'الكتاب', 'كتب',
  'عندكم', 'يعمل', 'تعمل', 'يستخدم', 'تستخدم', 'يساعد', 'تساعد', 'يستطيع',
  'تستطيع', 'يستطيعون', 'للقراءة', 'للعمل', 'فيها', 'لديه', 'لديها', 'قراءة',
  'للمكتبة', 'للمدرسة', 'مواعيد', 'عن',
].map(normalizeArabic));

const GENERIC_ENGLISH_FOLLOWUPS = new Set([
  'in', 'at', 'on', 'who', 'can', 'could', 'may', 'has', 'have', 'is', 'are', 'reads',
  'read', 'searches', 'needs', 'wants', 'using', 'uses', 'use', 'books', 'library',
  'the', 'a', 'an', 'with', 'for', 'to', 'from', 'his', 'her', 'their', 'services',
  'responsibilities', 'responsibility', 'allowed', 'help', 'work',
]);

export function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function hasNamedSensitivePersonReference(value) {
  const normalized = normalizeArabic(value);
  const rolePattern = /(?:الط(?:الب|لاب)(?:ة|ات)?|المستعير(?:ين|ون|ة|ات)?|الموظف(?:ين|ون|ة|ات)?|العامل(?:ين|ون|ة|ات)?|امين\s+المكتبة|امينة\s+المكتبة|المدير(?:ة)?|المعلم(?:ة)?)\s+([\p{L}]{2,})/gu;
  for (const match of normalized.matchAll(rolePattern)) {
    if (!GENERIC_ROLE_FOLLOWUPS.has(normalizeArabic(match[1]))) return true;
  }
  const englishRolePattern = /\b(?:students?|borrowers?|members?|employees?|teachers?|staff)\s+([A-Za-z][A-Za-z'-]{1,})/gi;
  for (const match of String(value).matchAll(englishRolePattern)) {
    if (!GENERIC_ENGLISH_FOLLOWUPS.has(match[1].toLowerCase())) return true;
  }
  return /(?:اسمي|اسمه|اسمها|اسم\s+(?:الطالب|الطالبة|المستعير|الموظف))\s+[\p{L}]{2,}/u.test(normalized)
    || /(?:ابني|ابنتي|طفلي|طفلتي|اخي|اختي|صديقي|صديقتي)\s+[\p{L}]{2,}/u.test(normalized)
    || /\b(?:my name is|i am)\s+[A-Z][a-z]+/i.test(value)
    || /\b(?:my (?:child|student|borrower|employee)|my name is)\s+[A-Z][a-z]+/i.test(value);
}

export function containsSensitivePersonalData(value) {
  const text = String(value);
  const normalized = normalizeDigits(text);
  const compactDigits = normalized.replace(/\D/g, '');
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /(?:\+?20)?0?1[0125]\d{8}/.test(compactDigits)
    || /\b\d{8,}\b/.test(normalized)
    || /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text)
    || /(?:اسم|رقم|بيانات|معلومات|سجل|حالة)\s*(?:الطالب|الطالبة|العضوية|المستعير|المستعيرة|الإعارة|الاعارة|الموظف|الموظفة)/u.test(text)
    || /(?:student\s+(?:name|number|record)|member\s+(?:id|number)|loan\s+record|password|verification\s+code|api\s*key|secret\s+key)/i.test(text)
    || /(?:كلمة\s*(?:المرور|السر)|رمز\s*(?:التحقق|الدخول|الوصول)|مفتاح\s*(?:api|سري)|بيانات\s*الدخول)/iu.test(text)
    || hasNamedSensitivePersonReference(text);
}
