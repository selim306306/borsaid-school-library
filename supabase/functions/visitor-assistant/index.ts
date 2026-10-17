import { containsSensitivePersonalData } from "./privacy-guard.js";
import { answerPublicQuestion, PERSONAL_DATA_REPLY } from "./assistant.js";

const ALLOWED_ORIGIN = "https://selim306306.github.io";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const configuredModel = "gemini-3.5-flash-lite";
const PUBLISHABLE_KEY = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  } catch {
    return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  }
})();

const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
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

async function hashedRateKey(request: Request) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function allowRate(key: string) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    if (rateBuckets.size > 5000) {
      for (const [itemKey, bucket] of rateBuckets) if (now - bucket.startedAt >= 60_000) rateBuckets.delete(itemKey);
    }
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  if (!PUBLISHABLE_KEY || request.headers.get("apikey") !== PUBLISHABLE_KEY) return jsonResponse({ error: "invalid_client" }, 401, origin);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 6000) return jsonResponse({ error: "request_too_large" }, 413, origin);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, origin);
  }
  const question = typeof body.question === "string"
    ? body.question.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, 1000)
    : "";
  if (!question) return jsonResponse({ error: "invalid_question" }, 400, origin);

  if (containsSensitivePersonalData(question)) {
    return jsonResponse({ ok: true, privacy_blocked: true, stored: false, text: PERSONAL_DATA_REPLY }, 200, origin);
  }
  if (!SUPABASE_URL || !GEMINI_API_KEY) return jsonResponse({ error: "assistant_unavailable" }, 503, origin);
  const rateKey = await hashedRateKey(request);
  if (!allowRate(rateKey)) return jsonResponse({ error: "rate_limited" }, 429, origin);

  let providerStatus = 0;
  let providerCode = "";
  const providerFetch: typeof fetch = async (input, init) => {
    let response: Response;
    try { response = await fetch(input, init); }
    catch (error) { providerCode = error instanceof Error ? error.name.replace(/[^A-Za-z]/g, "").slice(0, 40) : "NetworkError"; throw error; }
    if (String(input).startsWith("https://generativelanguage.googleapis.com/")) {
      providerStatus = response.status;
      if (!response.ok) {
        const error = await response.clone().json().catch(() => null);
        providerCode = String(error?.error?.status ?? "").replace(/[^A-Z_]/g, "").slice(0, 60);
      }
    }
    return response;
  };
  const result = await answerPublicQuestion({
    question,
    apiKey: GEMINI_API_KEY,
    model: configuredModel,
    supabaseUrl: SUPABASE_URL,
    publishableKey: PUBLISHABLE_KEY,
    fetchImpl: providerFetch,
  });
  if (!result.ok) return jsonResponse({ error: "assistant_unavailable", reason: result.reason, provider_status: providerStatus, provider_code: providerCode }, 502, origin);
  return jsonResponse({ ok: true, stored: false, ...result }, 200, origin);
});
