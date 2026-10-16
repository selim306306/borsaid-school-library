function normalizeIntentText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar')
    .trim();
}

const ADMIN_ACTION_PATTERNS = [
  /(?:افتح|ادخل)\s+(?:ال)?(?:لوحه|اداره)(?:\s+(?:الموقع|المدير|المكتبه))?/u,
  /(?:اضف|اضيف|احذف|امسح|عدل|غير|انشر|حدث|نفذ)\s+(?:لي\s+)?(?:كتاب|فرع|بيانات|اعلان|محتوي|صوره|صفحه|موظف|حساب|اعدادات?)/u,
  /(?:اضافه|حذف|تعديل|نشر|تغيير|اداره)\s+(?:ال)?(?:كتاب|فرع|بيانات|اعلان|موقع|حساب|موظف|موظفين|صلاحيات)/u,
  /(?:اعطني|اديني|امنحني)\s+(?:صلاحية|دخول|حساب|صلاحيات)/u,
  /(?:اريد|عايز|عاوز|ممكن)\s+(?:ان\s+)?(?:افتح|ادخل|اضيف|احذف|عدل|انشر|غير|احدث)\s+(?:ال)?(?:لوحه|اداره|كتاب|فرع|اعلان|حساب|بيانات)/u,
  /(?:اضف|اضيف|احذف|امسح|عدل|غير|انشر|حدث|نفذ)\s+(?:لي\s+)?(?:ال)?(?:مدرسه|مدارس|مكتبه|مكتبات)/u,
];

function isAdminActionRequest(normalized) {
  return ADMIN_ACTION_PATTERNS.some(pattern => pattern.test(normalized));
}

function isSiteManagerIntent(normalized) {
  return /(?:مدير|مسؤول|مسوول)\s*.{0,24}(?:موقع|بوابه)|(?:من|مين)\s+(?:هو\s+)?(?:ال)?(?:مدير|مسؤول|مسوول)/u.test(normalized);
}

function isSiteManagerSelfIntroduction(normalized) {
  return /^(?:(?:السلام عليكم|اهلا|مرحبا)\s+)?(?:انا|اسمي|معك)\s+(?:(?:الاستاذ|استاذ)\s+)?محمد\s+حامد(?:\s|$)/u.test(normalized);
}

function isSpecialistContactRequest(normalized) {
  const asksForContact = /(?:محتاج(?:ه)?|عايز(?:ه)?|عاوز(?:ه)?|اريد|ممكن|اود|كيف|ازاي|استطيع)/u.test(normalized);
  const asksToSpeak = /(?:اتكلم|اكلم|اتواصل|تواصل|اتحدث|تحدث)/u.test(normalized);
  const namesSpecialist = /(?:مختص|متخصص|اخصاي+|امين\s+المكتبه|مسؤول\s+المكتبه|مسوول\s+المكتبه)/u.test(normalized);
  return asksForContact && asksToSpeak && namesSpecialist;
}

export function resolveVisitorAssistantIntent(question) {
  const normalized = normalizeIntentText(question);
  if (!normalized) return null;

  if (isAdminActionRequest(normalized)) {
    return {
      text: 'هذا إجراء إداري لا تنفّذه دردشة الزوار. يلزم تسجيل الدخول إلى مساحة الموظفين بحساب مخوّل؛ وقول «أنا مدير الموقع» لا يثبت هوية المتحدث ولا يمنحه صلاحية.',
    };
  }

  if (isSpecialistContactRequest(normalized)) {
    return {
      text: 'أكيد. انتقل إلى قسم «اسأل أمين المكتبة» أسفل الصفحة لمراجعة خيارات التواصل المنشورة. رسالتك في هذه الدردشة لا تُرسل تلقائياً إلى نموذج الأسئلة أو Telegram.',
      actionLinks: [{ href: '#visitorQuestions', label: 'الانتقال إلى قسم «اسأل أمين المكتبة»' }],
    };
  }

  if (isSiteManagerSelfIntroduction(normalized)) {
    return {
      text: 'أهلاً محمد. يعرّف الموقع محمد حامد بأنه أخصائي أول مكتبات ومدير ومصمم المشروع. لا تتحقق هذه المحادثة من الهوية بالاسم وحده، ولا تمنح صلاحية إدارية.',
    };
  }

  if (isSiteManagerIntent(normalized)) {
    return {
      text: 'بحسب المعلومات العامة المنشورة على الموقع، محمد حامد هو مدير ومصمم الموقع وأخصائي أول مكتبات. هذه الإجابة لا تتحقق من هوية من يكتب هنا ولا تمنح أي صلاحية؛ ولأي إجراء إداري يلزم تسجيل الدخول إلى مساحة الموظفين.',
    };
  }

  return null;
}
