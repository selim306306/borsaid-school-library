import { containsSensitivePersonalData } from './supabase/functions/visitor-questions/privacy-guard.js?v=7cc123df22c3c45f';
import { resolveVisitorAssistantIntent } from './visitor-assistant-intents.mjs?v=713da4b8791c3f6b';
import { classifyVisitorCatalogIntent } from './visitor-catalog-intent.mjs?v=931445641eb2e68b';

export const VISITOR_PERSONAL_DATA_REPLY = 'حرصًا على الخصوصية، لا يمكن معالجة أسماء أو أرقام أو معلومات عن طالب أو مستعير أو موظف أو تفاصيل إعارة فردية. أعد صياغة السؤال ليكون عامًا عن خدمات المكتبة أو كتاب منشور، من دون بيانات شخصية أو معلومات سرية.';

export function isVisitorAssistantQuestionSensitive(question) {
  return containsSensitivePersonalData(String(question ?? ''));
}

export async function routeVisitorAssistantQuestion(question, {
  askFreeModel = async () => null,
  answerLocally = async () => ({ text: 'تعذّر الاتصال بالمساعد الذكي الآن؛ أعد المحاولة لاحقًا أو استخدم نموذج «أرسل سؤالًا للمساعد الذكي».' }),
} = {}) {
  const text = String(question ?? '').normalize('NFKC').trim();
  if (containsSensitivePersonalData(text)) {
    return { text: VISITOR_PERSONAL_DATA_REPLY, source: 'local', privacyBlocked: true, sent: false, sentToExternalModel: false };
  }
  const localIntent = resolveVisitorAssistantIntent(text);
  if (localIntent) return { ...localIntent, source: 'local', sent: false, sentToExternalModel: false };
  const catalogIntent = classifyVisitorCatalogIntent(text);

  let sentToExternalModel = false;
  try {
    const result = await askFreeModel(text, { externalAiConsent: true });
    sentToExternalModel = result?.sentToExternalModel === true;
    if (result?.ok === true && typeof result.text === 'string' && result.text.trim()) {
      const provider = result.provider || 'groq';
      return { ...result, text: result.text.trim(), source: provider, sent: true, sentToExternalModel: true };
    }
  } catch {
    // Continue with local public information; never try a different or paid provider.
  }
  const fallback = await answerLocally(text, { catalogIntent });
  return { ...fallback, source: 'local-fallback', sent: false, sentToExternalModel, freeModelUnavailable: true };
}
