import { containsSensitivePersonalData } from "./privacy-guard.js";

export const REDACTED_QUESTION = "تم حجب السؤال تلقائيًا لاحتوائه على بيانات شخصية أو سرية.";
export const PERSONAL_DATA_REPLY = "حرصًا على الخصوصية، لا يمكن معالجة أسماء أو أرقام أو معلومات عن طالب أو مستعير أو موظف. أعد صياغة السؤال ليكون عامًا عن خدمات المكتبة أو كتاب منشور، من دون بيانات شخصية أو معلومات سرية.";

const REDACTED_OWNER_ALERT = "تنبيه خصوصية: حُجب سؤال زائر تلقائيًا لاحتوائه على بيانات شخصية أو سرية. لم يُرسل نص السؤال إلى Gemini أو Telegram، ولم يُدرج في هذا الإشعار.";

function clip(value, maximum) {
  const text = String(value ?? "").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

export function buildOwnerNotification({ sensitive = false, question = "", autoAnswered = false, reply = "", replyCode = "" }) {
  if (sensitive) return REDACTED_OWNER_ALERT;
  const safeQuestion = clip(question, 1500);
  if (autoAnswered) {
    const safeReply = clip(reply, 2200);
    return [
      "سؤال جديد من نموذج الموقع — أجاب Gemini تلقائيًا.",
      "",
      "السؤال:",
      safeQuestion,
      "",
      "الرد الآلي الذي وصل للزائر:",
      safeReply,
    ].join("\n");
  }
  return [
    "تعذر الرد الآلي — سؤال جديد يحتاج متابعة من نموذج الموقع.",
    "",
    "السؤال:",
    safeQuestion,
    "",
    "للرد على صاحب السؤال فقط عبر البوت، أرسل:",
    `/reply ${clip(replyCode, 10)} ثم اكتب الرد بعد مسافة`,
  ].join("\n");
}

export async function notifyQuestionOwner({ getOwnerChatId, sendTelegramMessage, ...details }) {
  let ownerChatId = null;
  try {
    ownerChatId = await getOwnerChatId();
  } catch {
    return "not_linked";
  }
  if (!ownerChatId) return "not_linked";
  const message = buildOwnerNotification(details);
  try {
    return await sendTelegramMessage(String(ownerChatId), message) ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function processVisitorQuestion({
  question,
  visitorToken,
  visitorTokenHash,
  answerWithGemini,
  saveQuestion,
  getOwnerChatId,
  sendTelegramMessage,
}) {
  const sensitive = containsSensitivePersonalData(question);
  if (sensitive) {
    const created = await saveQuestion(REDACTED_QUESTION, visitorTokenHash, PERSONAL_DATA_REPLY);
    if (!created) return { status: 503, body: { error: "question_save_failed" } };
    const ownerNotification = await notifyQuestionOwner({
      sensitive: true,
      getOwnerChatId,
      sendTelegramMessage,
    });
    return {
      status: 201,
      body: {
        ok: true,
        question_id: created.id,
        access_token: visitorToken,
        auto_answered: true,
        question_display: REDACTED_QUESTION,
        reply: PERSONAL_DATA_REPLY,
        answered_at: created.answeredAt,
        owner_notification: ownerNotification,
      },
    };
  }

  let automaticAnswer = { ok: false };
  try {
    automaticAnswer = await answerWithGemini(question);
  } catch {
    // A provider exception is handled like any other unavailable automatic answer.
  }
  const safeAnswer = automaticAnswer?.ok === true && typeof automaticAnswer.text === "string" &&
    automaticAnswer.text.trim().length > 0 && automaticAnswer.text.trim().length <= 4000 &&
    !containsSensitivePersonalData(automaticAnswer.text);

  if (safeAnswer) {
    const reply = automaticAnswer.text.trim();
    const created = await saveQuestion(question, visitorTokenHash, reply);
    if (!created) return { status: 503, body: { error: "question_save_failed" } };
    const ownerNotification = await notifyQuestionOwner({
      question,
      autoAnswered: true,
      reply,
      getOwnerChatId,
      sendTelegramMessage,
    });
    return {
      status: 201,
      body: {
        ok: true,
        question_id: created.id,
        access_token: visitorToken,
        auto_answered: true,
        question_display: question,
        reply,
        answered_at: created.answeredAt,
        owner_notification: ownerNotification,
      },
    };
  }

  const created = await saveQuestion(question, visitorTokenHash);
  if (!created) return { status: 503, body: { error: "question_save_failed" } };
  const ownerNotification = await notifyQuestionOwner({
    question,
    autoAnswered: false,
    replyCode: created.replyCode,
    getOwnerChatId,
    sendTelegramMessage,
  });
  return {
    status: 201,
    body: {
      ok: true,
      question_id: created.id,
      access_token: visitorToken,
      auto_answered: false,
      question_display: question,
      owner_notification: ownerNotification,
    },
  };
}
