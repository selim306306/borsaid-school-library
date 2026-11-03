import { containsSensitivePersonalData } from "./privacy-guard.js";

export const TELEGRAM_PERSONAL_DATA_REPLY = "حرصًا على الخصوصية، لا يمكن للمساعد الذكي عبر Telegram معالجة أسماء أو أرقام أو معلومات عن طالب أو مستعير أو موظف أو تفاصيل إعارة فردية. لن يُرسل هذا السؤال إلى نموذج خارجي أو مدير الموقع، ولن يحفظه موقع المكتبة. أعد صياغته كسؤال عام بلا بيانات شخصية.";
export const TELEGRAM_PUBLIC_DISCLOSURE = "تنبيه: يجيب المساعد الذكي عبر Telegram تلقائيًا عن الأسئلة العامة باستخدام Qwen عبر Groq فقط إذا كان مفتاح المشروع مهيأً على الخطة المجانية. عند غياب هذا الإعداد لا يُستدعى نموذج آخر. يعتمد الرد على المعلومات العامة المنشورة، ولا يحفظ موقع المكتبة نص محادثة Telegram في قاعدة بياناته. لا ترسل بيانات تخص طالبًا أو موظفًا أو مستعيرًا أو إعارة. إذا استخدمت نموذج متابعة السؤال للمساعد الذكي على الموقع فقد يصل السؤال والرد إلى المدير عبر Telegram.";
const TELEGRAM_ANSWER_NOTICE = "تنبيه: أعدّ المساعد الذكي عبر Telegram الإجابة من معلومات الموقع العامة. إذا استُخدم Qwen عبر Groq فذلك عبر إعداد الخطة المجانية للمشروع فقط. لا يحفظ موقع المكتبة نص محادثة Telegram؛ وأسئلة المتابعة عبر نموذج «المساعد الذكي» على الموقع قد تصل إلى المدير عبر Telegram.";
const OWNER_REPLY_HELP = "للرد على سؤال متابعة وصل عبر نموذج «المساعد الذكي» في الموقع، أرسل:\n/reply رمز_السؤال نص_الرد\nمثال: /reply ABC2345678 شكرًا على سؤالك. يظهر الرد لصاحب السؤال فقط.";
const OWNER_CLAIM_REPLY = "لا يثبت ادعاء الهوية في رسالة الدردشة صلاحية المالك. ربط حساب المالك محصور برمز الإعداد المؤقت من جلسة المالك؛ لا أستطيع منح صلاحيات أو تجاوز هذا التحقق.";
const FORM_URL_FALLBACK = "https://selim306306.github.io/borsaid-school-library/#visitorQuestions";
const rateBuckets = new Map();

function constantTimeEqual(left, right) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function isOwnerClaim(text) {
  const normalized = String(text).normalize("NFKC").replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").replace(/[أإآ]/g, "ا").toLowerCase();
  const claimsOwner = /(?:انا|بصفتي)\s+(?:مالك|المالك|مدير|المدير)/u.test(normalized) || /(?:i am|i'm)\s+(?:the )?(?:owner|admin)/i.test(text);
  const asksForAction = /(?:ربط|اربط|اعداد|تهيئة|صلاحية|لوحة|دخول|حساب|link|setup|admin|dashboard|access)/iu.test(normalized);
  return claimsOwner && asksForAction;
}

function allowChatRate(chatId, now = Date.now()) {
  const current = rateBuckets.get(chatId);
  if (!current || now - current.startedAt >= 60_000) {
    rateBuckets.set(chatId, { startedAt: now, count: 1 });
    if (rateBuckets.size > 5000) {
      for (const [key, bucket] of rateBuckets) if (now - bucket.startedAt >= 60_000) rateBuckets.delete(key);
    }
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

export async function handleTelegramMessage({
  chatId,
  chatType = "private",
  text,
  ownerChatId = null,
  ownerSetupCode = "",
  websiteFormUrl = FORM_URL_FALLBACK,
  linkOwner = async () => false,
  saveOwnerReply = async () => false,
  sendText = async () => false,
  answerWithFreeProvider = async () => ({ ok: false, sentToExternalModel: false }),
  now = Date.now(),
} = {}) {
  if (chatType !== "private" || !chatId || typeof text !== "string") return { handled: false, reason: "ignored" };
  const chat = String(chatId);
  const message = text.trim().slice(0, 4500);
  if (!message) return { handled: false, reason: "empty" };

  const start = message.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?$/);
  if (!ownerChatId && start) {
    const suppliedCode = start[1] ?? "";
    if (ownerSetupCode && constantTimeEqual(suppliedCode, ownerSetupCode)) {
      const linked = await linkOwner(chat);
      await sendText(chat, linked
        ? "تم ربط حساب مالك الموقع بنجاح. ستصلك هنا أسئلة المتابعة الخاصة بنموذج «المساعد الذكي» على الموقع. للرد على صاحب سؤال بعينه، أرسل:\n/reply رمز_السؤال نص_الرد\n\nكل رد يظهر في صفحة صاحب السؤال فقط."
        : "تعذر إكمال ربط الحساب. أعد المحاولة من جلسة المالك.");
      return { handled: true, action: linked ? "owner_linked" : "owner_link_failed" };
    }
    await sendText(chat, `مرحبًا بك في المساعد الذكي لمكتبات بورسعيد المدرسية عبر Telegram.\n\n${TELEGRAM_PUBLIC_DISCLOSURE}\n\nأرسل سؤالًا عامًا عن المعلومات المنشورة؛ وإذا لم تتوفر تهيئة Qwen المجانية فسيُوجّهك المساعد للمتابعة الخاصة عبر الموقع.\n\nلمتابعة سؤال خاص مع المكتبة، استخدم نموذج «المساعد الذكي» على الموقع:\n${websiteFormUrl}`);
    return { handled: true, action: "public_start" };
  }

  if (ownerChatId && chat === String(ownerChatId)) {
    const reply = message.match(/^\/reply(?:@[A-Za-z0-9_]+)?\s+([A-Z2-9]{10})\s+([\s\S]{1,4000})$/);
    if (reply) {
      const replyCode = reply[1];
      const replyText = reply[2].trim().slice(0, 4000);
      if (!replyText) {
        await sendText(chat, "أضف نص الرد بعد رمز السؤال.");
        return { handled: true, action: "empty_reply" };
      }
      const saved = await saveOwnerReply(replyCode, replyText);
      await sendText(chat, saved
        ? "تم حفظ الرد. سيظهر لصاحب السؤال فقط في صفحة الموقع التي أرسل منها."
        : "لم أجد سؤالًا بهذا الرمز. راجع الرمز في رسالة السؤال وحاول مرة أخرى.");
      return { handled: true, action: saved ? "owner_reply_saved" : "owner_reply_missing" };
    }
    if (/^\/(?:start|help)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(message) || message.startsWith("/")) {
      await sendText(chat, OWNER_REPLY_HELP);
      return { handled: true, action: "owner_help" };
    }
  } else if (/^\/(?:start|help)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(message)) {
    await sendText(chat, `مرحبًا بك في المساعد الذكي لمكتبات بورسعيد المدرسية عبر Telegram.\n\n${TELEGRAM_PUBLIC_DISCLOSURE}\n\nأرسل سؤالًا عامًا عن المعلومات المنشورة؛ وإذا لم تتوفر تهيئة Qwen المجانية فسيُوجّهك المساعد للمتابعة الخاصة عبر الموقع.`);
    return { handled: true, action: "public_help" };
  } else if (message.startsWith("/")) {
    await sendText(chat, ownerChatId ? "اكتب سؤالًا عامًا عن معلومات الموقع المنشورة، أو استخدم /start لعرض تنبيه المساعد الذكي." : `استخدم /start لعرض طريقة عمل المساعد الذكي.\n${websiteFormUrl}`);
    return { handled: true, action: "unknown_command" };
  }

  if (isOwnerClaim(message)) {
    await sendText(chat, OWNER_CLAIM_REPLY);
    return { handled: true, action: "owner_claim_blocked", sentToExternalModel: false, stored: false };
  }
  if (containsSensitivePersonalData(message)) {
    await sendText(chat, TELEGRAM_PERSONAL_DATA_REPLY);
    return { handled: true, action: "private_blocked", sentToExternalModel: false, stored: false };
  }
  if (!allowChatRate(chat, now)) {
    await sendText(chat, "وصلت إلى الحد المؤقت للأسئلة. انتظر دقيقة ثم حاول مجددًا.");
    return { handled: true, action: "rate_limited", sentToExternalModel: false };
  }

  let result;
  try {
    result = await answerWithFreeProvider(message);
  } catch {
    result = { ok: false };
  }
  const sentToExternalModel = result?.sentToExternalModel === true;
  if (result?.ok === true && typeof result.text === "string" && result.text.trim()) {
    await sendText(chat, `${TELEGRAM_ANSWER_NOTICE}\n\n${result.text.trim()}`.slice(0, 3800));
    return { handled: true, action: "answered", sentToExternalModel, stored: false };
  }
  await sendText(chat, `تعذّر على المساعد الذكي إعداد إجابة آلية مجانية الآن. لا ننتقل إلى نموذج آخر. للمتابعة مع المكتبة، أرسل سؤالك عبر نموذج «المساعد الذكي» على الموقع؛ وقد تصل تذكرة المتابعة إلى المدير عبر Telegram:\n${websiteFormUrl}`);
  return { handled: true, action: "assistant_unavailable", sentToExternalModel, stored: false };
}
