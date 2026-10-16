import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { deriveReplySource } from "./source.js";

const ALLOWED_ORIGIN = "https://selim306306.github.io";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const PUBLISHABLE_KEY = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  } catch {
    return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  }
})();
const SERVICE_KEY = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  }
})();
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!PUBLISHABLE_KEY || request.headers.get("apikey") !== PUBLISHABLE_KEY) return jsonResponse({ error: "invalid_client" }, 401);
  if (!admin) return jsonResponse({ error: "service_not_ready" }, 503);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 12_000) return jsonResponse({ error: "request_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (body.action !== "submit") return jsonResponse({ error: "invalid_action" }, 400);

  let upstream: Response;
  try {
    upstream = await fetch(`${SUPABASE_URL}/functions/v1/visitor-questions`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return jsonResponse({ error: "assistant_unavailable" }, 502);
  }
  const result = await upstream.json().catch(() => null) as Record<string, unknown> | null;
  if (!result) return jsonResponse({ error: "assistant_unavailable" }, 502);

  const ticketId = typeof result.question_id === "string" ? result.question_id : "";
  const source = upstream.ok && result.ok === true
    ? deriveReplySource(result)
    : null;
  if (source && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
    const { data, error } = await admin
      .from("visitor_questions")
      .update({ reply_source: source })
      .eq("id", ticketId)
      .select("id")
      .maybeSingle();
    if (error || !data?.id) console.error("visitor-question source update failed");
  }
  return jsonResponse(result, upstream.status);
});
