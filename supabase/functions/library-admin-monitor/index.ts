import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildTelegramMessage, cleanMetrics, isValidMonitorKey } from "./metrics.mjs";
import { auditPublicDesign } from "./design-audit.mjs";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const db = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const monitorKey = request.headers.get("x-monitor-key");
  if (!isValidMonitorKey(monitorKey)) return json({ error: "not_found" }, 404);
  if (!db) return json({ error: "server_configuration_missing" }, 503);
  let dryRun = false;
  try { const body = await request.json(); dryRun = body?.dry_run === true; }
  catch { return json({ error: "invalid_json" }, 400); }
  const { data: result, error: tickError } = await db.rpc("admin_agent_monitor_tick", { p_key: monitorKey, p_dry_run: dryRun });
  if (tickError) return json({ error: "monitor_unavailable" }, 503);
  if (!["ok", "dry_run"].includes(result?.status)) return json({ status: result?.status ?? "unavailable", notify: false }, 200);
  const metrics = cleanMetrics(result?.metrics);
  let designReport: unknown = null, designSaved: Record<string, unknown> | null = null;
  let designStatus = "unavailable";
  try {
    designReport = await auditPublicDesign();
    if (!dryRun) {
      const { data, error } = await db.rpc("admin_agent_record_design", { p_report: designReport, p_manual: false });
      if (error) throw new Error("design_report_unavailable");
      designSaved = data;
    }
    designStatus = "checked";
  } catch { designStatus = "unavailable"; }
  // This path does not save a report, update the ledger or send any message.
  if (dryRun) return json({ status: "dry_run", metrics, design_status: designStatus, design_report: designReport, notify: false }, 200);
  const notificationId = result.notification_id || designSaved?.notification_id;
  if (!notificationId) return json({ status: "ok", metrics, design_status: designStatus, notify: false }, 200);
  let sent = false;
  try {
    if (!telegramToken) throw new Error("telegram_unavailable");
    const { data: config, error: configError } = await db.from("telegram_bot_config").select("owner_chat_id").eq("id", true).limit(1).maybeSingle();
    if (configError || !config?.owner_chat_id) throw new Error("destination_unavailable");
    const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.owner_chat_id, text: buildTelegramMessage(metrics, designSaved?.meaningful_change === true), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    const response = await telegramResponse.json();
    sent = telegramResponse.ok && response?.ok === true;
  } catch { sent = false; }
  await db.rpc("admin_agent_monitor_delivery_result", { p_id: notificationId, p_sent: sent });
  return json({ status: sent ? "sent" : "failed", metrics, design_status: designStatus, notify: sent }, sent ? 200 : 502);
});
