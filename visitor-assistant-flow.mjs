import { containsSensitivePersonalData } from './supabase/functions/visitor-questions/privacy-guard.js';
import { resolveVisitorAssistantIntent } from './visitor-assistant-intents.mjs';

export const VISITOR_PERSONAL_DATA_REPLY = 'حرصًا على الخصوصية، لا يمكن معالجة أسماء أو أرقام أو معلومات عن طالب أو مستعير أو موظف أو تفاصيل إعارة فردية. أعد صياغة السؤال ليكون عامًا عن خدمات المكتبة أو كتاب منشور، من دون بيانات شخصية أو معلومات سرية.';

export function isVisitorAssistantQuestionSensitive(question) {
  return containsSensitivePersonalData(String(question ?? ''));
}

export async function routeVisitorAssistantQuestion(question, {
  askGemini = async () => null,
  answerLocally = async () => ({ text: 'تعذّر إكمال الإجابة الآن؛ يمكنك استخدام البحث والفروع المنشورة مباشرةً.' }),
} = {}) {
  const text = String(question ?? '').normalize('NFKC').trim();
  if (containsSensitivePersonalData(text)) {
    return { text: VISITOR_PERSONAL_DATA_REPLY, source: 'local', privacyBlocked: true, sent: false };
  }
  const localIntent = resolveVisitorAssistantIntent(text);
  if (localIntent) return { ...localIntent, source: 'local', sent: false };

  try {
    const result = await askGemini(text);
    if (result?.ok === true && typeof result.text === 'string' && result.text.trim()) {
      return { ...result, text: result.text.trim(), source: 'gemini', sent: true };
    }
  } catch {
    // The local public-guide answer is used when Gemini is unavailable.
  }
  const fallback = await answerLocally(text);
  return { ...fallback, source: 'local-fallback', sent: false };
}
