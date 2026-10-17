import { answerPublicQuestion } from "./assistant.js";
import { handleTelegramMessage } from "./bot-handler.js";
import { isSetupOwner } from "./setup-auth.js";

const ALLOWED_ORIGIN = "https://selim306306.github.io";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const OWNER_SETUP_CODE = Deno.env.get("TELEGRAM_OWNER_SETUP_CODE") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const configuredModel = Deno.env.get("VISITOR_ASSISTANT_GEMINI_MODEL") ?? "gemini-3.8-flash";
const PUBLISHABLE_KEYS = (() => {
  try {
    const value = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return value && typeof value === "object" ? value as Record<string, string> : {};
  } catch {
    return {};
  }
})();
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default ?? Object.values(PUBLISHABLE_KEYS)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WEBSITE_FORM_URL = "https://selim306306.github.io/borsaid-school-library/#visitorQuestions";

function response(body: unknown, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin === ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
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

async function linkOwner(chatId: string) {
  const now = new Date().toISOString();
  const filter = new URLSearchParams({ id: "eq.true", owner_chat_id: "is.null", select: "owner_chat_id" });
  const linked = await databaseRequest(`telegram_bot_config?${filter.toString()}`, "PATCH", {
    owner_chat_id: chatId,
    owner_linked_at: now,
    updated_at: now,
  });
  const row = Array.isArray(linked.data) ? linked.data[0] : null;
  return linked.ok && String(row?.owner_chat_id ?? "") === chatId;
}

async function saveOwnerReply(replyCode: string, replyText: string) {
  const filter = new URLSearchParams({ reply_code: `eq.${replyCode}`, select: "id" });
  const updated = await databaseRequest(`visitor_questions?${filter.toString()}`, "PATCH", {
    reply: replyText,
    answered_at: new Date().toISOString(),
    reply_source: "telegram",
  });
  const row = Array.isArray(updated.data) ? updated.data[0] : null;
  return updated.ok && Boolean(row?.id);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: { "Vary": "Origin" } });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
    });
  }

  if (request.method === "GET" && url.searchParams.get("action") === "setup") {
    // The setup route only registers the fixed webhook; it never exposes or redirects the bot token.
    if (origin !== ALLOWED_ORIGIN || !authorizedPublicKey(request)) return response({ error: "not_authorized" }, 403, origin);
    if (!await isSetupOwner(request, { supabaseUrl: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY })) return response({ error: "not_authorized" }, 403, origin);
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
  if (!chat || (typeof chat.id !== "number" && typeof chat.id !== "string")) return new Response("ok", { status: 200 });
  const resultText = typeof message?.text === "string" ? message.text : "";
  if (!resultText.trim()) return new Response("ok", { status: 200 });

  await handleTelegramMessage({
    chatId: String(chat.id),
    chatType: String(chat.type ?? ""),
    text: resultText,
    ownerChatId: await getOwnerChatId(),
    ownerSetupCode: OWNER_SETUP_CODE,
    websiteFormUrl: WEBSITE_FORM_URL,
    linkOwner,
    saveOwnerReply,
    sendText,
    answerWithGemini: async (question) => {
      if (!GEMINI_API_KEY || !SUPABASE_URL || !PUBLISHABLE_KEY) return { ok: false };
      return await answerPublicQuestion({
        question,
        apiKey: GEMINI_API_KEY,
        model: configuredModel,
        supabaseUrl: SUPABASE_URL,
        publishableKey: PUBLISHABLE_KEY,
      });
    },
  });
  return new Response("ok", { status: 200 });
});
