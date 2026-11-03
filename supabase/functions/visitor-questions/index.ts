import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { processVisitorQuestion } from "./submission-flow.js";
import { answerPublicQuestionWithFreeProvider } from "../_shared/public-assistant.js";

const ALLOWED_ORIGINS = new Set(["https://selim306306.github.io"]);
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const GROQ_API_KEY = Deno.env.get("LIBRARY_GROQ_FREE_PLAN_API_KEY") ?? "";
const GROQ_FREE_PLAN_CONFIRMED = Deno.env.get("LIBRARY_GROQ_FREE_PLAN_CONFIRMED") === "true";

function keySet(name: string): Record<string, string> {
  try {
    const value = JSON.parse(Deno.env.get(name) ?? "{}");
    return value && typeof value === "object"
      ? value as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

const PUBLISHABLE_KEYS = keySet("SUPABASE_PUBLISHABLE_KEYS");
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default ??
  Object.values(PUBLISHABLE_KEYS)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SECRET_KEYS = keySet("SUPABASE_SECRET_KEYS");
// The legacy service-role key is a JWT; supabase-js sends it as a Bearer token for database access.
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  SECRET_KEYS.default ?? Object.values(SECRET_KEYS)[0] ?? "";
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "null",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function authorizedPublicKey(request: Request) {
  return Boolean(PUBLISHABLE_KEY) &&
    request.headers.get("apikey") === PUBLISHABLE_KEY;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function randomHex(byteCount: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newReplyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

const rateBuckets = new Map<string, { startedAt: number; count: number }>();

async function requestBucketKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]
    ?.trim();
  const source = request.headers.get("cf-connecting-ip") ?? forwarded ??
    "unknown";
  return await sha256Hex(source);
}

function allowRate(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    if (rateBuckets.size > 5000) {
      for (const [itemKey, bucket] of rateBuckets) {
        if (now - bucket.startedAt >= windowMs) rateBuckets.delete(itemKey);
      }
    }
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

async function sendTelegramMessage(chatId: string, text: string) {
  if (!BOT_TOKEN) return false;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    const result = await response.json().catch(() => null) as
      | { ok?: boolean }
      | null;
    return response.ok && result?.ok === true;
  } catch {
    return false;
  }
}

async function getOwnerChatId() {
  if (!admin) return null;
  const { data, error } = await admin
    .from("telegram_bot_config")
    .select("owner_chat_id")
    .eq("id", true)
    .maybeSingle();
  if (error || !data?.owner_chat_id) return null;
  return String(data.owner_chat_id);
}

async function saveQuestion(
  question: string,
  visitorTokenHash: string,
  reply?: string,
) {
  if (!admin) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = reply ? new Date().toISOString() : null;
    const replyCode = newReplyCode();
    const row: Record<string, unknown> = {
      question,
      reply_code: replyCode,
      visitor_token_hash: visitorTokenHash,
    };
    if (reply !== undefined) {
      row.reply = reply;
      row.answered_at = now;
    }
    const { data, error } = await admin
      .from("visitor_questions")
      .insert(row)
      .select("id,reply_code")
      .single();
    if (!error && data?.id) {
      return {
        id: String(data.id),
        replyCode: String(data.reply_code),
        answeredAt: now,
      };
    }
    if (error?.code !== "23505") return null;
  }
  return null;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: { "Vary": "Origin" },
    });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  }
  if (!authorizedPublicKey(request)) {
    return jsonResponse({ error: "invalid_client" }, 401, origin);
  }
  if (!admin) return jsonResponse({ error: "service_not_ready" }, 503, origin);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 12_000) {
    return jsonResponse({ error: "request_too_large" }, 413, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, origin);
  }

  const bucketKey = await requestBucketKey(request);
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "submit") {
    if (!allowRate(`submit:${bucketKey}`, 3, 10 * 60 * 1000)) {
      return jsonResponse({ error: "rate_limited" }, 429, origin);
    }
    if (typeof body.website === "string" && body.website.trim()) {
      return jsonResponse({ ok: true }, 202, origin);
    }
    const question = typeof body.question === "string"
      ? body.question.normalize("NFKC").replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
        " ",
      ).trim().slice(0, 1500)
      : "";
    if (!question || question.length > 1500) {
      return jsonResponse({ error: "invalid_question" }, 400, origin);
    }

    const visitorToken = randomHex(32);
    const visitorTokenHash = await sha256Hex(visitorToken);
    const submission = await processVisitorQuestion({
      question,
      visitorToken,
      visitorTokenHash,
      externalAiConsent: body.externalAiConsent === true,
      answerWithFreeProvider: (question: string) => answerPublicQuestionWithFreeProvider({
        question,
        groqApiKey: GROQ_API_KEY,
        groqFreePlanConfirmed: GROQ_FREE_PLAN_CONFIRMED,
        externalAiConsent: true,
        supabaseUrl: SUPABASE_URL,
        publishableKey: PUBLISHABLE_KEY,
      }),
      saveQuestion,
      getOwnerChatId,
      sendTelegramMessage,
    });
    return jsonResponse(submission.body, submission.status, origin);
  }

  if (action === "poll") {
    if (!allowRate(`poll:${bucketKey}`, 120, 60 * 1000)) {
      return jsonResponse({ error: "rate_limited" }, 429, origin);
    }
    const questionId = typeof body.question_id === "string"
      ? body.question_id.trim()
      : "";
    const accessToken = typeof body.access_token === "string"
      ? body.access_token.trim()
      : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(questionId) ||
      !/^[0-9a-f]{64}$/i.test(accessToken)
    ) {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }
    const tokenHash = await sha256Hex(accessToken);
    const { data, error } = await admin
      .from("visitor_questions")
      .select("reply,answered_at")
      .eq("id", questionId)
      .eq("visitor_token_hash", tokenHash)
      .maybeSingle();
    if (error || !data) {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }
    return jsonResponse(
      {
        ok: true,
        answered: Boolean(data.reply),
        reply: data.reply ?? null,
        answered_at: data.answered_at ?? null,
      },
      200,
      origin,
    );
  }

  return jsonResponse({ error: "invalid_action" }, 400, origin);
});
