export const REDACTED_QUESTION = 'تم حجب السؤال تلقائيًا لاحتوائه على بيانات شخصية أو سرية.';

export function deriveReplySource(result) {
  if (!result || result.ok !== true) return null;
  if (result.auto_answered === false) return result.owner_notification === 'sent' ? 'telegram' : null;
  if (result.auto_answered !== true) return null;
  if (result.question_display === REDACTED_QUESTION) return 'local';
  // The deployed reply_source check currently allows only gemini, telegram, local.
  // Keep Qwen's provider in the response, but leave this database field unset.
  return null;
}
