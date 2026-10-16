const ALLOWED_ORIGIN = "https://selim306306.github.io";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const OWNER_SETUP_CODE = Deno.env.get("TELEGRAM_OWNER_SETUP_CODE") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLISHABLE_KEYS = (() => {
  try {
    const value = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return value && typeof value === "object" ? value as Record<string, string> : {};
  } catch {
    return {};
  }
})();
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default ?? Object.values(PUBLISHABLE_KEYS)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function response(body: unknown, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin === ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    headers.set("Access-Control-Allow-Headers", "apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function authorizedPublicKey(request: Request) {
  return Boolean(PUBLISHABLE_KEY) && request.headers.get("apikey") === PUBLISHABLE_KEY;
}

async function databaseRequest(path: string, method: "GET" | "PATCH", value?: unknown) {
  if (!SUPABASE_URL || !SERVICE_KEY) return { ok: false, status: 0, data: null as unknown };
  try {
    const headers = new Headers({
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
    });
    const init: RequestInit = { method, headers };
    if (value !== undefined) {
      headers.set("Content-Type", "application/json");
      headers.set("Prefer", "return=representation");
      init.body = JSON.stringify(value);
    }
    const result = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
    const data = await result.json().catch(() => null);
    return { ok: result.ok, status: result.status, data };
  } catch {
    return { ok: false, status: 0, data: null as unknown };
  }
}

type TelegramCallResult = { ok: true; result: unknown } | { ok: false; errorCode: number; reason: string };

async function telegramCall(method: string, data: Record<string, unknown>): Promise<TelegramCallResult> {
  if (!BOT_TOKEN) return { ok: false, errorCode: 0, reason: "missing_configuration" };
  try {
    const result = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await result.json().catch(() => null) as { ok?: boolean; result?: unknown; error_code?: number; description?: string } | null;
    if (result.ok && payload?.ok) return { ok: true, result: payload.result ?? true };
    const errorCode = Number(payload?.error_code ?? result.status);
    const description = String(payload?.description ?? "").toLowerCase();
    const reason = errorCode === 401 ? "invalid_or_revoked_token" : description.includes("webhook") ? "webhook_rejected" : "telegram_api_error";
    return { ok: false, errorCode, reason };
  } catch {
    return { ok: false, errorCode: 0, reason: "network_error" };
  }
}

async function registerWebhook() {
  if (!BOT_TOKEN || !SUPABASE_URL) return { ok: false, errorCode: 0, reason: "missing_configuration" } as const;
  const secretToken = await sha256Hex(`${BOT_TOKEN}:borsaid-school-library:telegram-webhook:v1`);
  return await telegramCall("setWebhook", {
    url: `${SUPABASE_URL}/functions/v1/telegram-webhook`,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

async function sendText(chatId: string, text: string) {
  const result = await telegramCall("sendMessage", { chat_id: chatId, text });
  return result.ok;
}

async function getOwnerChatId() {
  const query = new URLSearchParams({ select: "owner_chat_id", id: "eq.true", limit: "1" });
  const result = await databaseRequest(`telegram_bot_config?${query.toString()}`, "GET");
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]?.owner_chat_id) return null;
  return String(result.data[0].owner_chat_id);
}

const WEBSITE_FORM_URL = "https://selim306306.github.io/borsaid-school-library/#visitorQuestions";

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: { "Vary": "Origin" } });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
    });
  }

  if (request.method === "GET" && url.searchParams.get("action") === "setup") {
    // This bootstrap can only set the function's fixed Telegram webhook URL; it cannot expose or redirect the bot token.
    if (origin !== ALLOWED_ORIGIN || !authorizedPublicKey(request)) return response({ error: "not_authorized" }, 403, origin);
    if (!BOT_TOKEN || !SUPABASE_URL) return response({ error: "service_not_ready" }, 503, origin);
    const registered = await registerWebhook();
    return response(registered.ok ? { ok: true } : { ok: false, reason: registered.reason, error_code: registered.errorCode }, registered.ok ? 200 : 502, origin);
  }

  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return response({ error: "service_not_ready" }, 503);
  const expectedSecret = await sha256Hex(`${BOT_TOKEN}:borsaid-school-library:telegram-webhook:v1`);
  const presentedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!constantTimeEqual(presentedSecret, expectedSecret)) return new Response("unauthorized", { status: 401 });

  let update: Record<string, unknown>;
  try {
    update = await request.json() as Record<string, unknown>;
  } catch {
    return new Response("ok", { status: 200 });
  }
  const message = update.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  if (!chat || chat.type !== "private" || (typeof chat.id !== "number" && typeof chat.id !== "string")) return new Response("ok", { status: 200 });
  const chatId = String(chat.id);
  const text = typeof message?.text === "string" ? message.text.trim().slice(0, 4500) : "";
  if (!text) return new Response("ok", { status: 200 });

  const ownerChatId = await getOwnerChatId();
  const start = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?$/);
  if (!ownerChatId && start) {
    const suppliedCode = start[1] ?? "";
    if (OWNER_SETUP_CODE && constantTimeEqual(suppliedCode, OWNER_SETUP_CODE)) {
      const now = new Date().toISOString();
      const filter = new URLSearchParams({ id: "eq.true", owner_chat_id: "is.null", select: "owner_chat_id" });
      const linked = await databaseRequest(`telegram_bot_config?${filter.toString()}`, "PATCH", {
        owner_chat_id: chatId,
        owner_linked_at: now,
        updated_at: now,
      });
      const row = Array.isArray(linked.data) ? linked.data[0] : null;
      if (linked.ok && row?.owner_chat_id && String(row.owner_chat_id) === chatId) {
        await sendText(chatId, "تم ربط حساب مالك الموقع بنجاح. ستصلك هنا أسئلة الزوار المرسلة من الموقع. للرد على صاحب سؤال بعينه، أرسل:\n/reply رمز_السؤال نص_الرد\n\nكل رد يظهر في صفحة صاحب السؤال فقط.");
      } else {
        await sendText(chatId, "تعذر إكمال ربط الحساب. أعد المحاولة من جلسة المالك.");
      }
      return new Response("ok", { status: 200 });
    }
    await sendText(chatId, `لإرسال سؤال خاص والحصول على الرد في صفحة صاحب السؤال، استخدم نموذج الموقع:\n${WEBSITE_FORM_URL}`);
    return new Response("ok", { status: 200 });
  }

  if (ownerChatId && chatId === ownerChatId) {
    const reply = text.match(/^\/reply(?:@[A-Za-z0-9_]+)?\s+([A-Z2-9]{10})\s+([\s\S]{1,4000})$/);
    if (reply) {
      const replyCode = reply[1];
      const replyText = reply[2].trim().slice(0, 4000);
      if (!replyText) {
        await sendText(chatId, "أضف نص الرد بعد رمز السؤال.");
        return new Response("ok", { status: 200 });
      }
      const filter = new URLSearchParams({ reply_code: `eq.${replyCode}`, select: "id" });
      const updated = await databaseRequest(`visitor_questions?${filter.toString()}`, "PATCH", {
        reply: replyText,
        answered_at: new Date().toISOString(),
        reply_source: "telegram",
      });
      const row = Array.isArray(updated.data) ? updated.data[0] : null;
      if (!updated.ok || !row?.id) await sendText(chatId, "لم أجد سؤالًا بهذا الرمز. راجع الرمز في رسالة السؤال وحاول مرة أخرى.");
      else await sendText(chatId, "تم حفظ الرد. سيظهر لصاحب السؤال فقط في صفحة الموقع التي أرسل منها.");
      return new Response("ok", { status: 200 });
    }
    await sendText(chatId, "للرد على سؤال: /reply رمز_السؤال نص_الرد\nمثال: /reply ABC2345678 شكرًا على سؤالك، هذه الإجابة.");
    return new Response("ok", { status: 200 });
  }

  if (!ownerChatId && /^\/help(?:@[A-Za-z0-9_]+)?$/.test(text)) {
    await sendText(chatId, `لإرسال سؤال خاص والحصول على الرد في صفحة صاحب السؤال، استخدم نموذج الموقع:\n${WEBSITE_FORM_URL}`);
  }
  return new Response("ok", { status: 200 });
});
