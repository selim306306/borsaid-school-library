import {
  answerPublicQuestionWithFreeProvider as answerSharedPublicQuestion,
  buildPublicContext as buildSharedPublicContext,
} from "../_shared/public-assistant.js";

export {
  GROQ_CHAT_COMPLETIONS_URL,
  GROQ_QWEN_MODEL,
  PERSONAL_DATA_REPLY,
  PUBLIC_SITE_GUIDE,
  catalogQueries,
} from "../_shared/public-assistant.js";

export function buildPublicContext(question, options = {}) {
  return buildSharedPublicContext(question, { ...options, includeNewsArchive: true });
}

export function answerPublicQuestionWithFreeProvider(options = {}) {
  return answerSharedPublicQuestion({ ...options, includeNewsArchive: true, allowGeneralKnowledge: true });
}
