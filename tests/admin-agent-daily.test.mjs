import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const daily = readFileSync(new URL('../supabase/migrations/20261017225207_admin_agent_daily_cairo.sql', import.meta.url), 'utf8');
const design = readFileSync(new URL('../supabase/migrations/20261017225410_admin_agent_design_review.sql', import.meta.url), 'utf8');
test('daily schedule guards Cairo 09:00, cancels two-hour schedule and stores 24h cadence', () => {
  assert.match(daily, /interval_hours=24/);
  assert.match(daily, /extract\(hour FROM clock_timestamp\(\) AT TIME ZONE 'Africa\/Cairo'\) <> 9/);
  assert.match(daily, /'0 6,7 \* \* \*'/);
  assert.match(daily, /cron\.unschedule\(v_job\)/);
  assert.match(daily, /interval '20 hours'/);
  const hour = text => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(text));
  assert.equal(hour('2026-10-18T06:00:00Z'), '09');
  assert.equal(hour('2026-11-01T07:00:00Z'), '09');
});
test('design reports are private and notifications require a real source and issue-set change', () => {
  assert.match(design, /ENABLE ROW LEVEL SECURITY/);
  assert.match(design, /FROM PUBLIC, anon, authenticated/);
  assert.match(design, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(design, /v_old\.source_hash IS DISTINCT FROM v_hash/);
  assert.match(design, /v_old\.issues_fingerprint IS DISTINCT FROM v_fingerprint/);
  assert.match(design, /AND NOT p_manual/);
  assert.match(design, /ON CONFLICT\(delivery_day\) DO NOTHING/);
  assert.doesNotMatch(design, /UPDATE public\.|DELETE FROM|ALTER TABLE public\./);
});
