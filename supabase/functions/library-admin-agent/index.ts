import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { aggregateMetrics, planAction, validGoal } from "./policy.mjs";
import { auditPublicDesign } from "../library-admin-monitor/design-audit.mjs";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const originAllowed = "https://selim306306.github.io";
const key = Deno.env.get("GEMINI_API_KEY") ?? "";
const models = new Set(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);

Deno.serve(async request => {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": origin === originAllowed ? originAllowed : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
    "Content-Type": "application/json", "Cache-Control": "no-store",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!originAllowed || origin !== originAllowed) return json({ error: "origin_not_allowed" }, 403);
  if (!url || !anon) return json({ error: "server_configuration_missing" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return json({ error: "authentication_required" }, 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const libraryId = String(body.library_id ?? "");
  const goal = String(body.goal ?? "review");
  const model = String(body.model ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite");
  // No free-form prompt, title, ID or record can enter the provider payload.
  if (Object.keys(body).some(name => !["library_id", "goal", "model", "consent"].includes(name))
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(libraryId)
      || !validGoal(goal) || !models.has(model)) return json({ error: "invalid_request" }, 400);
  if (goal !== "design_review" && body.consent !== true) return json({ error: "consent_required" }, 400);
  const { data: review, error } = await client.rpc("library_admin_agent", { p_library_id: libraryId, p_action: "review" });
  if (error) return json({ error: error.code === "42501" ? "not_authorized" : "metrics_unavailable" }, error.code === "42501" ? 403 : 503);
  if (goal === "design_review") {
    try {
      const report = await auditPublicDesign();
      const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
      const { data: saved, error: saveError } = await service.rpc("admin_agent_record_design", { p_report: report, p_manual: true });
      if (saveError) return json({ error: "design_report_unavailable" }, 503);
      return json({ design_report: saved.report, published_changes: false, sent_to_gemini: false });
    } catch { return json({ error: "design_review_unavailable" }, 503); }
  }
  if (!key) return json({ error: "server_configuration_missing" }, 503);
  const metrics = aggregateMetrics(review?.metrics);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "أنت محلل لوكيل مدير مكتبة مدرسية. أمامك أعداد مجهولة فقط. اكتب ملخصاً عربياً قصيراً عن اكتمال بيانات الفهرس؛ لا تفترض أسباباً أو سجلات أو اتجاهات. لا تدّع تنفيذ تعديلات. مسموح فقط باقتراح تنظيف المسافات في العنوان والمؤلف والسلسلة إذا طُلب. حقول المؤلف والتصنيف وISBN المفقودة تحتاج مراجعة بشرية ولا تخمّنها. لا تطلب بيانات طلاب أو مستعيرين ولا تغيير أمان أو حذف أو نشر. لا توجّه لتنفيذ SQL أو كود. المخرجات JSON يحتوي summary نصاً فقط." }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ goal, metrics }) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { summary: { type: "STRING" } }, required: ["summary"] } },
      }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return json({ error: "assistant_provider_failed" }, 502);
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
    const output = JSON.parse(text);
    if (typeof output.summary !== "string" || !output.summary.trim()) return json({ error: "assistant_output_invalid" }, 502);
    // Provider never controls the executable action. Only this allowlist does.
    return json({ summary: output.summary.slice(0, 1800), action: planAction(goal), metrics, model });
  } catch { return json({ error: "assistant_provider_failed" }, 502); }
});
