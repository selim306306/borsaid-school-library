import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
const configuredModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
const allowedModels = new Set(["gemini-3.5-flash-lite", "gemini-3.8-flash"]);
const allowedIntents = new Set(["inventory_summary", "circulation_summary", "reservation_summary", "manager_summary"]);
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

type GeminiResult = { ok: true; text: string } | { ok: false; error: "assistant_provider_failed" | "assistant_output_invalid" };

async function generateText(model: string, systemInstruction: string, prompt: string, structured = false) {
  try {
    const generationConfig: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: 700 };
    if (structured) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = {
        type: "OBJECT",
        properties: { summary: { type: "STRING" }, actions: { type: "ARRAY", items: { type: "STRING" } } },
        required: ["summary", "actions"],
      };
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { ok: false, error: "assistant_provider_failed" };
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
    if (!text.trim()) return { ok: false, error: "assistant_output_invalid" };
    return { ok: true, text };
  } catch {
    return { ok: false, error: "assistant_provider_failed" };
  }
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

  let body: { library_id?: string; intent?: string; model?: string; mode?: string; message?: string; consent?: boolean };
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
  const libraryId = String(body.library_id ?? "");
  const mode = String(body.mode ?? "summary");
  const model = String(body.model ?? configuredModel);
  const intent = String(body.intent ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(libraryId)
      || !["summary", "test", "chat"].includes(mode)
      || !allowedModels.has(model)
      || (mode === "summary" && !allowedIntents.has(intent))) {
    return json({ error: "invalid_request" }, 400, origin);
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (mode === "chat" && (!message || message.length > 800)) return json({ error: "invalid_request" }, 400, origin);
  if (mode === "chat" && body.consent !== true) return json({ error: "consent_required" }, 400, origin);
  if (mode === "chat") {
    const normalizedDigits = message.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    const hasContactOrRecordData = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(message)
      || /(?:\+?20|0)?1(?:0|1|2|5)\d{8}/.test(normalizedDigits.replace(/[^\d+]/g, ""))
      || /\b\d{8,}\b/.test(normalizedDigits)
      || /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(message)
      || /(?:رقم\s*(?:العضوية|الطالب|المستعير)|سجل\s*إعارة|اسم\s+(?:الطالب|الطالبة|المستعير|المستعيرة)|بيانات\s+(?:الطالب|الطالبة|المستعير|المستعيرة))/u.test(message);
    if (hasContactOrRecordData) return json({ error: "personal_data_not_allowed" }, 400, origin);
  }

  const { data: membership, error: membershipError } = await userClient.from("library_memberships")
    .select("role").eq("library_id", libraryId).eq("user_id", authData.user.id).eq("status", "active").maybeSingle();
  if (membershipError || !membership || !["owner", "admin", "librarian", "reporter"].includes(membership.role)) {
    return json({ error: "not_authorized" }, 403, origin);
  }
  if (mode === "summary" && intent === "manager_summary" && !["owner", "admin"].includes(membership.role)) {
    return json({ error: "not_authorized" }, 403, origin);
  }

  if (mode === "test") {
    const result = await generateText(
      model,
      "أنت تختبر اتصالاً تقنياً فقط. أجب بكلمة واحدة: متصل.",
      "أجب بكلمة واحدة فقط: متصل.",
    );
    if (!result.ok) return json({ error: result.error }, 502, origin);
    return json({ ok: true, model }, 200, origin);
  }

  if (mode === "chat") {
    const result = await generateText(
      model,
      "أنت مساعد تشغيل وإرشاد لموظفي مكتبات المدارس في بورسعيد. أجب بالعربية بوضوح وبخطوات عملية عن وظائف الموقع: البحث العام، إضافة العنوان والنسخ والفروع، النشر الذي يحتاج اختياراً صريحاً، الجرد، الإعارة والإرجاع، الحجوزات، طلبات الفروع، التقارير، الأدوار والخصوصية. وضّح الفرق بين الفهرس العام ولوحة الموظفين، واذكر أن النشر وتغيير الحالات وتسجيل الإعارة والحجز تتم من النماذج المخصصة وبعد مراجعة الموظف. لا تملك وصولاً إلى قاعدة البيانات أو السجلات الفردية، ولا تدّع أنك قرأت سجلاً أو نفذت إجراءً أو أرسلت تنبيهاً. لا تطلب أو تعالج أسماء الطلاب أو المستعيرين أو أرقامهم أو بيانات الاتصال أو تفاصيل إعارة/حجز فردية؛ إن تعلّق السؤال بشخص بعينه، ارفض استلام تفاصيله واطلب صياغة السؤال بشكل عام. لا تخترع سياسات محلية مثل مدة الإعارة أو مواعيد الفروع؛ أحِل الموظف إلى السياسة المعتمدة لدى المكتبة.",
      `سؤال إرشادي عام من موظف مكتبة: ${message}`,
    );
    if (!result.ok) return json({ error: result.error }, 502, origin);
    return json({ text: result.text.slice(0, 3000), model }, 200, origin);
  }

  async function count(table: string, filters: Array<[string, string, unknown]> = []) {
    let query = userClient.from(table).select("id", { count: "exact", head: true }).eq("library_id", libraryId);
    for (const [method, column, value] of filters) query = query[method](column, value);
    const { count, error } = await query;
    if (error) throw new Error("metrics_unavailable");
    return count ?? 0;
  }

  let metrics: Record<string, number | boolean>;
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
    } else if (intent === "reservation_summary") {
      const [queued, ready, fulfilled, cancelled] = await Promise.all([
        count("reservations", [["eq", "status", "queued"]]), count("reservations", [["eq", "status", "ready"]]),
        count("reservations", [["eq", "status", "fulfilled"]]), count("reservations", [["eq", "status", "cancelled"]]),
      ]);
      metrics = { queued, ready, fulfilled, cancelled };
    } else {
      const [titles, copies, available, onLoan, lost, maintenance, openLoans, overdueLoans, queued, ready, branches, publishedBranches, libraryResult] = await Promise.all([
        count("catalog_titles"), count("holdings"), count("holdings", [["eq", "status", "available"]]),
        count("holdings", [["eq", "status", "on_loan"]]), count("holdings", [["eq", "status", "lost"]]),
        count("holdings", [["eq", "status", "maintenance"]]), count("loans", [["is", "returned_at", null]]),
        count("loans", [["is", "returned_at", null], ["lt", "due_at", new Date().toISOString()]]),
        count("reservations", [["eq", "status", "queued"]]), count("reservations", [["eq", "status", "ready"]]),
        count("branches"), count("branches", [["eq", "is_published", true]]),
        userClient.from("libraries").select("is_published,interlibrary_enabled").eq("id", libraryId).maybeSingle(),
      ]);
      if (libraryResult.error || !libraryResult.data) throw new Error("metrics_unavailable");
      metrics = {
        titles, copies, available, onLoan, lost, maintenance, openLoans, overdueLoans,
        queuedReservations: queued, readyReservations: ready, branches, publishedBranches,
        libraryPublished: Boolean(libraryResult.data.is_published),
        interlibraryEnabled: Boolean(libraryResult.data.interlibrary_enabled),
      };
    }
  } catch {
    return json({ error: "metrics_unavailable" }, 503, origin);
  }

  const prompt = `اكتب ملخصاً تشغيلياً عربياً موجزاً ومفيداً اعتماداً على الأعداد والإعدادات الإجمالية التالية فقط. لا تفترض أسباباً أو اتجاهات زمنية غير موجودة. اقترح من 2 إلى 4 إجراءات عملية قابلة للتحقق، ووضّح أن الملخص استرشادي ولا ينفذ شيئاً. في manager_summary لخّص جاهزية النشر والإعارة والجرد والمشاركة من القيم المقدمة فقط، ولا تقترح إرسال رسالة أو تغيير إعداد دون موافقة المالك. نوع التقرير: ${intent}. الأعداد والإعدادات: ${JSON.stringify(metrics)}. أخرج JSON فقط يحتوي summary نصاً و actions مصفوفة نصوص.`;
  const result = await generateText(
    model,
    "أنت مساعد تقارير لمكتبة مدرسية. استخدم فقط المقاييس والإعدادات المجمعة المقدمة، ولا تستنتج بيانات أشخاص أو أسباباً أو اتجاهات زمنية، ولا تنفذ عمليات أو ترسل رسائل.",
    prompt,
    true,
  );
  if (!result.ok) return json({ error: result.error }, 502, origin);
  let output: { summary?: unknown; actions?: unknown };
  try { output = JSON.parse(result.text); } catch { return json({ error: "assistant_output_invalid" }, 502, origin); }
  if (typeof output.summary !== "string" || !Array.isArray(output.actions)
      || output.actions.some((item) => typeof item !== "string")) {
    return json({ error: "assistant_output_invalid" }, 502, origin);
  }
  return json({ summary: output.summary.slice(0, 1600), actions: output.actions.slice(0, 5).map((item) => item.slice(0, 300)) }, 200, origin);
});
