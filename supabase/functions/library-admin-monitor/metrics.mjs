export const METRIC_KEYS = Object.freeze(['titles','missing_author','missing_classification','missing_isbn','whitespace_candidates']);
export function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
export function cleanMetrics(row = {}) {
  return Object.fromEntries(METRIC_KEYS.map(key => [key, count(row[key])]));
}
export function buildTelegramMessage(metrics, designChanged = false) {
  const m = cleanMetrics(metrics);
  const catalog = m.titles === 0
    ? 'الفهرس التشغيلي للمكتبتين خالٍ من العناوين. المطلوب: إضافة أو استيراد قائمة كتب متحققة من لوحة الإدارة؛ روابط القراءة العامة ليست مخزون المكتبة.'
    : `العناوين: ${m.titles}\nبلا مؤلف: ${m.missing_author}\nبلا تصنيف: ${m.missing_classification}\nبلا ISBN: ${m.missing_isbn}\nمرشحات تنظيف المسافات: ${m.whitespace_candidates}`;
  const design = designChanged ? '\nظهر تغيّر تقني جديد في التصميم يستحق المراجعة. افتح تقرير فحص التصميم للاقتراحات؛ لا يُنشر تغيير مرئي قبل موافقتك.' : '';
  return `وكيل مدير المكتبة: مراجعة يومية تحتاج قرارك\n${catalog}${design}\nافتح لوحة وكيل الإدارة؛ لا تعدّل من Telegram.\nhttps://selim306306.github.io/borsaid-school-library/`;
}
export function isValidMonitorKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}
