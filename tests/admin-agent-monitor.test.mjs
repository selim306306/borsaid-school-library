import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTelegramMessage, cleanMetrics, isValidMonitorKey } from '../supabase/functions/library-admin-monitor/metrics.mjs';

const sql = readFileSync(new URL('../supabase/migrations/20261017224858_admin_agent_monitor.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/library-admin-monitor/index.ts', import.meta.url), 'utf8');

 test('metrics are anonymous, bounded aggregates and the message is fixed-template', () => {
  assert.deepEqual(cleanMetrics({ titles: 4.9, missing_author: -1, missing_isbn: '2', raw: 'secret' }), { titles: 0, missing_author: 0, missing_classification: 0, missing_isbn: 2, whitespace_candidates: 0 });
  const message = buildTelegramMessage({ titles: 2, missing_author: 1, missing_classification: 0, missing_isbn: 3, whitespace_candidates: 1 });
  assert.match(message, /وكيل مدير المكتبة/);
  assert.match(message, /لا تعدّل من Telegram/);
  assert.doesNotMatch(message, /a70f6fa4|c5d10456|owner_chat_id|token/i);
});

test('header key validation is strict and bounded', () => {
  assert.equal(isValidMonitorKey('a'.repeat(128)), true);
  assert.equal(isValidMonitorKey('a'.repeat(129)), false);
  assert.equal(isValidMonitorKey('a b'), false);
  assert.equal(isValidMonitorKey(null), false);
});

test('SQL enforces service role, vault key, cooldown, daily dedup, and private grants', () => {
  for (const pattern of [
    /CREATE EXTENSION IF NOT EXISTS pg_cron/i,
    /CREATE EXTENSION IF NOT EXISTS pg_net/i,
    /vault\.create_secret/i,
    /auth\.role\(\) IS DISTINCT FROM 'service_role'/i,
    /v_now < v_last \+ interval '1 hour'/i,
    /UNIQUE \(delivery_day\)/i,
    /ON CONFLICT \(delivery_day\) DO NOTHING/i,
    /REVOKE ALL ON FUNCTION public\.admin_agent_monitor_tick\(text, boolean\) FROM PUBLIC, anon, authenticated/i,
    /GRANT EXECUTE ON FUNCTION public\.admin_agent_monitor_tick\(text, boolean\) TO service_role/i,
    /admin_agent_monitor_delivery_result\(p_id uuid, p_sent boolean\)/i,
    /GRANT EXECUTE ON FUNCTION public\.admin_agent_monitor_status\(uuid\) TO authenticated/i,
    /17 \*\/2 \* \* \*/i,
  ]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /students|loans|patrons/i);
});

test('Edge function is POST-only and does not expose backend errors or CORS', () => {
  assert.match(edge, /request\.method !== "POST"/);
  assert.match(edge, /x-monitor-key/);
  assert.match(edge, /admin_agent_monitor_tick/);
  assert.match(edge, /sendMessage/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin/);
  assert.doesNotMatch(edge, /from\("admin_agent_monitor_deliveries"\)/);
  assert.doesNotMatch(edge, /console\.(log|error)/);
});
