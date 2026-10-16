export const SITE_OWNER_LIBRARY_IDS = new Set([
  'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4',
  'c5d10456-1c6e-4bd1-8275-d14e354ac285',
]);

export function canDeleteOwnedSchool(role, libraryId) {
  return role === 'owner' && typeof libraryId === 'string' && libraryId.length > 0;
}

export function schoolDeletionErrorMessage(message) {
  const value = String(message || '').toLowerCase();
  if (value.includes('school_branding_list_failed') || value.includes('school_storage_count_mismatch')) {
    return 'تعذّرت معاينة كل ملفات شعارات المدرسة؛ لم يُحذف أي سجل. أعد المحاولة بعد التحقق من الاتصال.';
  }
  if (value.includes('school_has_external_requests')) {
    return 'لا يمكن حذف المدرسة الآن: توجد طلبات واردة من مكتبات أخرى، ويجب أن يعالجها أصحابها أولاً.';
  }
  if (value.includes('last_owned_library')) {
    return 'لا يمكن حذف آخر مكتبة تملكها؛ يجب أن تبقى لك مكتبة نشطة واحدة على الأقل حتى لا تفقد صلاحية الإدارة.';
  }
  if (value.includes('impact_changed')) {
    return 'تغيّر عدد السجلات منذ المعاينة؛ لم يُحذف شيء. أعد المعاينة وراجع الأثر من جديد.';
  }
  if (value.includes('school_not_found')) {
    return 'لم يعد سجل المدرسة موجوداً. حدّث الصفحة ثم اختر مدرسة أخرى.';
  }
  if (value.includes('authentication_required') || value.includes('active_library_owner_required')) {
    return 'الحذف متاح لمالك مدرسة مسجّل الدخول فقط.';
  }
  return 'تعذّر حذف المدرسة. حدّث الصفحة وأعد معاينة الأثر قبل المحاولة مجدداً.';
}
