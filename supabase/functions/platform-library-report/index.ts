import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { manualDelivery } from "./manual-delivery.ts";
import { METRICS } from "./delivery.js";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const originAllowed = Deno.env.get("APP_ORIGIN") ?? "";
const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const models = new Set(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
const owners = ["a70f6fa4-0dc1-4612-9280-6c2a8e049dd4", "c5d10456-1c6e-4bd1-8275-d14e354ac285"];
const count = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.trunc(Number(value)) : 0;
const metricsOnly = (row: any) => Object.fromEntries(METRICS.map(([key]: string[]) => [key, count(row?.[key])]));
async function summarize(report: any, model: string) {
  if (!apiKey) return { status: 503, body: { error: "server_configuration_missing" } };
  // Explicit allowlist: names, IDs and individual records never reach Gemini.
  const data = { totals: metricsOnly(report.totals), libraries: (report.libraries ?? []).map((row: any, i: number) => ({ label: `مكتبة ${i + 1}`, ...metricsOnly(row) })) };
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "أنت محلل تقارير مكتبات مدرسية. استخدم الأعداد المجمعة المجهولة فقط. لا تطلب أو تخترع أسماء أو معرّفات أو بيانات أشخاص. لا تنفذ تغييرات أو ترسل تنبيهات." }] },
        contents: [{ role: "user", parts: [{ text: `أنشئ قراءة عربية لمؤشرات جميع المكتبات المرقمة والإجمالي. هذه لقطة حالية فقط، لا تخترع أسباباً أو اتجاهات زمنية أو حكماً على جودة الأداء. ميّز العناوين عن النسخ. إن كانت المؤشرات صفرية فقل لا توجد بيانات مسجلة. اقترح إجراءين إلى أربعة إجراءات تحقق إرشادية لا تنفذ شيئاً. JSON فقط: summary نص و actions مصفوفة نصوص. البيانات المجمعة المجهولة: ${JSON.stringify(data)}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { summary: { type: "STRING" }, actions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["summary", "actions"] } },
      }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("provider");
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "";
    const output = JSON.parse(text);
    if (typeof output.summary !== "string" || !Array.isArray(output.actions) || output.actions.some((item: unknown) => typeof item !== "string")) throw new Error("output");
    return { status: 200, body: { summary: output.summary.slice(0, 1600), actions: output.actions.slice(0, 4).map((item: string) => item.slice(0, 300)), model } };
  } catch { return { status: 502, body: { error: "assistant_provider_failed" } }; }
}
Deno.serve(async request => {
  const origin = request.headers.get("origin");
  const headers = { "Access-Control-Allow-Origin": origin === originAllowed ? originAllowed : "null", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!originAllowed || origin !== originAllowed) return json({ error: "origin_not_allowed" }, 403);
  if (!url || !anon) return json({ error: "server_configuration_missing" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ error: "authentication_required" }, 401);
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = String(body.action ?? "summary");
  const model = String(body.model ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite");
  if (!["summary", "preview", "send"].includes(action) || !models.has(model)) return json({ error: "invalid_request" }, 400);
  const { data: memberships, error: membershipError } = await client.from("library_memberships").select("library_id").eq("user_id", auth.user.id).eq("status", "active").eq("role", "owner").in("library_id", owners);
  if (membershipError || !memberships?.length) return json({ error: "not_authorized" }, 403);
  if (action === "send") {
    const result = await manualDelivery(action, body, auth.user.id, null, async () => null);
    return json(result.body, result.status);
  }
  const { data: report, error } = await client.rpc("get_platform_library_report", {});
  if (error || !report || typeof report !== "object") return json({ error: error?.code === "42501" ? "not_authorized" : "metrics_unavailable" }, error?.code === "42501" ? 403 : 503);
  const result = action === "summary" ? await summarize(report, model) : await manualDelivery(action, body, auth.user.id, report, () => summarize(report, model));
  return json(result.body, result.status);
});
