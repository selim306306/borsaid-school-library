import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const configuredModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
const allowedModels = new Set(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && origin === allowedOrigin ? allowedOrigin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "origin_not_allowed" }, 403, origin);
  if (!supabaseUrl || !anonKey || !geminiApiKey) return json({ error: "server_configuration_missing" }, 503, origin);

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401, origin);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "authentication_required" }, 401, origin);

  let body: { library_id?: string; intent?: string; model?: string };
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
  const libraryId = String(body.library_id ?? "");
  const intent = String(body.intent ?? "");
  const model = String(body.model ?? configuredModel);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(libraryId)
      || !["inventory_summary", "circulation_summary", "reservation_summary"].includes(intent)
      || !allowedModels.has(model)) {
    return json({ error: "invalid_request" }, 400, origin);
  }
  const { data: membership, error: membershipError } = await userClient.from("library_memberships")
    .select("role").eq("library_id", libraryId).eq("user_id", authData.user.id).eq("status", "active").maybeSingle();
  if (membershipError || !membership || !["owner", "admin", "librarian", "reporter"].includes(membership.role)) {
    return json({ error: "not_authorized" }, 403, origin);
  }

  async function count(table: string, filters: Array<[string, string, unknown]> = []) {
    let query = userClient.from(table).select("id", { count: "exact", head: true }).eq("library_id", libraryId);
    for (const [method, column, value] of filters) query = query[method](column, value);
    const { count, error } = await query;
    if (error) throw new Error("metrics_unavailable");
    return count ?? 0;
  }

  let metrics: Record<string, number>;
  try {
    if (intent === "inventory_summary") {
      const [titles, copies, lost, maintenance, available, onLoan] = await Promise.all([
        count("catalog_titles"), count("holdings"), count("holdings", [["eq", "status", "lost"]]),
        count("holdings", [["eq", "status", "maintenance"]]), count("holdings", [["eq", "status", "available"]]),
        count("holdings", [["eq", "status", "on_loan"]]),
      ]);
      metrics = { titles, copies, lost, maintenance, available, onLoan };
    } else if (intent === "circulation_summary") {
      const [openLoans, overdueLoans, availableCopies] = await Promise.all([
        count("loans", [["is", "returned_at", null]]),
        count("loans", [["is", "returned_at", null], ["lt", "due_at", new Date().toISOString()]]),
        count("holdings", [["eq", "status", "available"]]),
      ]);
      metrics = { openLoans, overdueLoans, availableCopies };
    } else {
      const [queued, ready, fulfilled, cancelled] = await Promise.all([
        count("reservations", [["eq", "status", "queued"]]), count("reservations", [["eq", "status", "ready"]]),
        count("reservations", [["eq", "status", "fulfilled"]]), count("reservations", [["eq", "status", "cancelled"]]),
      ]);
      metrics = { queued, ready, fulfilled, cancelled };
    }
  } catch {
    return json({ error: "metrics_unavailable" }, 503, origin);
  }

  const prompt = `اكتب ملخصاً تشغيلياً عربياً موجزاً ومفيداً لأمين مكتبة مدرسية اعتماداً على الأعداد الإجمالية التالية فقط. لا تفترض أسباباً أو اتجاهات زمنية غير موجودة. اقترح من 2 إلى 4 إجراءات عملية قابلة للتحقق، ووضّح أن الملخص استرشادي. نوع التقرير: ${intent}. الأعداد: ${JSON.stringify(metrics)}. أخرج JSON فقط يحتوي summary نصاً و actions مصفوفة نصوص.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "أنت مساعد تقارير لمكتبة مدرسية. استخدم فقط المقاييس العددية المقدمة. لا تطلب أو تستنتج بيانات أشخاص، ولا تنفذ عمليات على قاعدة البيانات." }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { summary: { type: "STRING" }, actions: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["summary", "actions"],
        },
      },
    }),
  });
  if (!response.ok) return json({ error: "assistant_provider_failed" }, 502, origin);
  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
  let output: { summary?: unknown; actions?: unknown };
  try { output = JSON.parse(text ?? "{}"); } catch { return json({ error: "assistant_output_invalid" }, 502, origin); }
  if (typeof output.summary !== "string" || !Array.isArray(output.actions)
      || output.actions.some((item) => typeof item !== "string")) {
    return json({ error: "assistant_output_invalid" }, 502, origin);
  }
  return json({ summary: output.summary.slice(0, 1600), actions: output.actions.slice(0, 5).map((item) => item.slice(0, 300)) }, 200, origin);
});
