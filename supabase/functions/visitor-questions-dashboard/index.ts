import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { normalizeReplySource, sanitizeOwnerDisplayText } from "./sanitize.ts";

const ALLOWED_ORIGIN = "https://selim306306.github.io";
const OWNER_LIBRARY_IDS = [
  "a70f6fa4-0dc1-4612-9280-6c2a8e049dd4",
  "c5d10456-1c6e-4bd1-8275-d14e354ac285",
];
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");

function publishableKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  } catch {
    return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  }
}

function secretKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  }
}

const PUBLISHABLE_KEY = publishableKey();
const SERVICE_KEY = secretKey();
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
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
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function isSiteOwner(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match || !SUPABASE_URL || !PUBLISHABLE_KEY) return false;

  const accessToken = match[1];
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  const userId = userData?.user?.id;
  if (userError || !userId) return false;

  const { data: memberships, error: membershipError } = await userClient
    .from("library_memberships")
    .select("library_id, role, status")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active")
    .in("library_id", OWNER_LIBRARY_IDS)
    .limit(2);
  return !membershipError && Array.isArray(memberships) && memberships.length > 0;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (request.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  if (!await isSiteOwner(request)) return jsonResponse({ error: "not_authorized" }, 403);
  if (!admin) return jsonResponse({ error: "service_not_ready" }, 503);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1000) return jsonResponse({ error: "request_too_large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (body.action !== "list") return jsonResponse({ error: "invalid_action" }, 400);

  const { data, error } = await admin
    .from("visitor_questions")
    .select("question, reply, reply_source, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !Array.isArray(data)) {
    console.error("owner visitor-question dashboard query failed");
    return jsonResponse({ error: "query_failed" }, 503);
  }

  const questions = data.map((row) => {
    const reply = typeof row.reply === "string" && row.reply ? row.reply : null;
    return {
      question: sanitizeOwnerDisplayText(row.question, "question"),
      reply: reply ? sanitizeOwnerDisplayText(reply, "reply") : null,
      source: normalizeReplySource(row.reply_source),
      status: reply ? "answered" : "pending",
    };
  });
  return jsonResponse({ ok: true, questions }, 200);
});
