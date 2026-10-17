import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { reportMessages, signPreview, verifyPreview } from "./delivery.js";

// This path is deliberately separate from visitor questions and never creates a ticket.
export async function manualDelivery(action: string, body: Record<string, unknown>, user: string, report: unknown, summarize: () => Promise<any>) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bot = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !bot || !url) return { status: 503, body: { error: "telegram_configuration_missing" } };
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error: configError } = await admin.from("telegram_bot_config").select("owner_chat_id").eq("id", true).limit(1).maybeSingle();
  if (configError || !config?.owner_chat_id) return { status: 503, body: { error: "telegram_owner_not_linked" } };
  if (action === "preview") {
    const summary = await summarize().catch(() => null);
    const ai = summary?.status === 200 ? summary.body : null;
    const messages = reportMessages(report, ai);
    const expires = Date.now() + 10 * 60 * 1000;
    const token = await signPreview({ user, expires, nonce: crypto.randomUUID(), messages }, secret);
    return { status: 200, body: { messages, token, expires_at: new Date(expires).toISOString(), ai_included: Boolean(ai), destination: "حساب المالك المحفوظ على Telegram" } };
  }
  if (body.confirm !== true) return { status: 400, body: { error: "confirmation_required" } };
  const preview = await verifyPreview(body.token, secret, user);
  if (!preview) return { status: 400, body: { error: "preview_invalid_or_expired" } };
  // Claim before any external effect: retries cannot resend a partial/uncertain delivery.
  const { error: claimError } = await admin.from("owner_report_deliveries").insert({ nonce: preview.nonce, status: "sending" });
  if (claimError) return { status: claimError.code === "23505" ? 409 : 503, body: { error: claimError.code === "23505" ? "already_attempted" : "delivery_unavailable" } };
  let sent = 0;
  for (const text of preview.messages) {
    try {
      const result = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: config.owner_chat_id, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15000),
      });
      const response = await result.json();
      if (!result.ok || response?.ok !== true) throw new Error("telegram_delivery_failed");
      sent++;
    } catch {
      await admin.from("owner_report_deliveries").update({ status: "uncertain", sent_parts: sent }).eq("nonce", preview.nonce);
      return { status: 502, body: { error: "delivery_uncertain", sent_parts: sent, total_parts: preview.messages.length } };
    }
  }
  await admin.from("owner_report_deliveries").update({ status: "sent", sent_parts: sent }).eq("nonce", preview.nonce);
  return { status: 200, body: { ok: true, sent_parts: sent } };
}
