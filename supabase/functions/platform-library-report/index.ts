import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const configuredModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
const allowedModels = new Set(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";
const platformOwnerLibraryIds = [
  "a70f6fa4-0dc1-4612-9280-6c2a8e049dd4",
  "c5d10456-1c6e-4bd1-8275-d14e354ac285",
];
const metricKeys = [
  "branches", "titles", "copies", "available", "lost",
  "open_loans", "overdue_loans", "queued_reservations", "ready_reservations",
] as const;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && origin === allowedOrigin ? allowedOrigin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}
function safeCount(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
}
function metricsOnly(row: Record<string, unknown>) {
  return Object.fromEntries(metricKeys.map(key => [key, safeCount(row?.[key])]));
}

async function generateText(model: string, systemInstruction: string, prompt: string) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              actions: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["summary", "actions"],
          },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { ok: false as const, error: "assistant_provider_failed" };
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
    if (!text.trim()) return { ok: false as const, error: "assistant_output_invalid" };
    return { ok: true as const, text };
  } catch {
    return { ok: false as const, error: "assistant_provider_failed" };
  }
}

Deno.serve(async request => {
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

  let body: { action?: string; model?: string };
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
  const action = String(body.action ?? "summary");
  const model = String(body.model ?? configuredModel);
  if (action !== "summary" || !allowedModels.has(model)) return json({ error: "invalid_request" }, 400, origin);

  const { data: ownerMemberships, error: membershipError } = await userClient.from("library_memberships")
    .select("library_id")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .eq("role", "owner")
    .in("library_id", platformOwnerLibraryIds);
  if (membershipError || !ownerMemberships?.length) return json({ error: "not_authorized" }, 403, origin);

  const { data: report, error: reportError } = await userClient.rpc("get_platform_library_report", {});
  if (reportError || !report || typeof report !== "object") {
    const message = String(reportError?.message ?? "");
    if (reportError?.code === "42501" || message.includes("platform_owner_required")) {
      return json({ error: "not_authorized" }, 403, origin);
    }
    return json({ error: "metrics_unavailable" }, 503, origin);
  }

  const source = report as Record<string, unknown>;
  const totals = source.totals && typeof source.totals === "object"
    ? metricsOnly(source.totals as Record<string, unknown>)
    : Object.fromEntries(metricKeys.map(key => [key, 0]));
  const sourceLibraries = Array.isArray(source.libraries) ? source.libraries : [];
  const anonymousMetrics = {
    scope: "لقطة حالية مجمعة لجميع المكتبات؛ لا تتضمن أسماء أو معرفات مكتبات، ولا بيانات شخصية أو تفاصيل فردية، ولا بيانات زمنية للمقارنة.",
    totals,
    libraries: sourceLibraries.map((entry, index) => ({
      label: `مكتبة ${index + 1}`,
      ...metricsOnly(entry as Record<string, unknown>),
    })),
  };
  const prompt = `أنشئ قراءة عربية موجزة وواضحة لمؤشرات التقرير التالي، باعتباره لقطة حالية فقط. قارِن الأعداد بين جميع المكتبات المرقمة الواردة في البيانات عند وجود سجلات، ولا تقتصر على مكتبتين. ميّز بوضوح بين عدد العناوين وعدد النسخ. لا تصف أي مكتبة بالنجاح أو الفشل، ولا تخترع أسباباً أو اتجاهات أو مقارنات زمنية. إذا كانت المؤشرات صفرية أو لا توجد سجلات تشغيلية فقل «لا توجد بيانات مسجلة» وامتنع عن استنتاج جودة الأداء. اقترح من إجراءين إلى أربعة إجراءات تحقق عملية مستندة حصراً إلى الأعداد، واذكر أنها توصيات إرشادية لا تنفذ شيئاً. البيانات المجمعة المجهولة فقط: ${JSON.stringify(anonymousMetrics)}. أخرج JSON فقط وفيه summary نص و actions مصفوفة نصوص.`;
  const result = await generateText(
    model,
    "أنت محلل تقارير لمكتبات مدرسية. استخدم الأعداد المجمعة المجهولة فقط. لا تطلب أسماء مكتبات أو أشخاص ولا تستنتج أسباباً أو اتجاهاً زمنياً أو حكماً على الأداء. لا تنفذ تغييرات أو ترسل تنبيهات.",
    prompt,
  );
  if (!result.ok) return json({ error: result.error }, 502, origin);
  let output: { summary?: unknown; actions?: unknown };
  try { output = JSON.parse(result.text); } catch { return json({ error: "assistant_output_invalid" }, 502, origin); }
  if (typeof output.summary !== "string" || !Array.isArray(output.actions)
      || output.actions.some(item => typeof item !== "string")) {
    return json({ error: "assistant_output_invalid" }, 502, origin);
  }
  return json({
    summary: output.summary.slice(0, 1600),
    actions: output.actions.slice(0, 4).map(item => String(item).slice(0, 300)),
    model,
  }, 200, origin);
});
