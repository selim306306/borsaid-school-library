import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261017173000_public_page_view_totals.sql', import.meta.url), 'utf8');
test('public summary has no parameters, three totals and a fixed safe search path', () => {
  assert.match(sql, /get_public_page_view_totals\(\)/);
  assert.match(sql, /returns table \(total_views bigint, today_views bigint, month_views bigint\)/);
  assert.match(sql, /stable\s+security definer\s+set search_path = ''/);
  assert.match(sql, /Africa\/Cairo/);
  assert.match(sql, /limit 1/i);
  assert.match(sql, /revoke all on function public\.get_public_page_view_totals\(\) from public/i);
  assert.match(sql, /grant execute .* to anon, authenticated, service_role/i);
});
test('summary reads only existing aggregate history and never grants table access', () => {
  assert.match(sql, /from public\.site_page_view_daily/);
  assert.match(sql, /clock\.today - 400/);
  assert.doesNotMatch(sql, /(?:from|join)\s+public\.(?:visitors|patrons|loans|visitor_questions)/i);
  assert.doesNotMatch(sql, /grant\s+select|create\s+policy|alter\s+table|insert\s+into|update\s+public|delete\s+from/i);
});
