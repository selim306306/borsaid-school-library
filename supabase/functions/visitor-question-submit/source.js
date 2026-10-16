export const REDACTED_QUESTION = 'تم حجب السؤال تلقائيًا لاحتوائه على بيانات شخصية أو سرية.';

export function deriveReplySource(result) {
  if (!result || result.ok !== true) return null;
  if (result.auto_answered === false) return 'telegram';
  if (result.auto_answered !== true) return null;
  return result.question_display === REDACTED_QUESTION ? 'local' : 'gemini';
}
