import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261015213400_anonymous_aggregate_page_views.sql', import.meta.url), 'utf8');
const adminCheckRevocation = readFileSync(new URL('../supabase/migrations/20261015213700_revoke_anon_site_admin_check.sql', import.meta.url), 'utf8');
const trackingRoleRestriction = readFileSync(new URL('../supabase/migrations/20261015213900_anon_only_page_view_rpc.sql', import.meta.url), 'utf8');

const expectedSections = ['home', 'discover', 'branches', 'announcements', 'about', 'reading', 'educationResearch'];

test('the browser tracker exposes only the fixed public section allowlist', () => {
  const block = app.match(/const PUBLIC_PAGE_VIEW_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(block, 'public section labels exist');
  const actual = [...block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]);
  assert.deepEqual(actual, expectedSections);
  assert.match(app, /record_public_page_view',\s*\{\s*p_section:\s*viewName\s*\}/);
  assert.match(app, /Promise\.resolve\(publicAnalyticsSupabase\.rpc\('record_public_page_view'/);
  assert.match(app, /credentials:\s*'omit'/);
  assert.match(app, /referrerPolicy:\s*'no-referrer'/);
});

test('the database stores only daily section totals and blocks direct visitor access', () => {
  const table = sql.match(/create table public\.site_page_view_daily \(([\s\S]*?)\n\);/)?.[1];
  assert.ok(table, 'daily aggregate table exists');
  const columns = [...table.matchAll(/^\s{2}([a-z_]+)\s+(?:date|text|bigint)\b/gm)].map(match => match[1]);
  assert.deepEqual(columns, ['view_date', 'section', 'page_views']);
  assert.match(sql, /alter table public\.site_page_view_daily enable row level security/i);
  assert.match(sql, /revoke all on public\.site_page_view_daily from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.site_page_view_daily to authenticated/i);
  assert.match(sql, /for select to authenticated\s+using \(public\.is_site_media_admin\(\)\)/i);
  assert.match(sql, /grant execute on function public\.record_public_page_view\(text\) to anon, authenticated/i);
});

test('the tracking function rejects unknown sections and aggregate limits remain staff-only', () => {
  for (const section of expectedSections) {
    assert.ok(sql.includes(`'${section}'`), `SQL whitelist includes ${section}`);
  }
  assert.match(sql, /Unsupported public section/);
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer, 'public footer exists');
  assert.doesNotMatch(footer, /privacyNotice|site-analytics-public-note|لتحسين الموقع، نسجل/);
  const analyticsPanel = html.match(/<section class="staff-panel" id="siteAnalyticsPanel"[\s\S]*?<\/section>/)?.[0];
  assert.ok(analyticsPanel, 'staff-only analytics panel remains available');
  assert.match(analyticsPanel, /أعداد يومية مجمّعة حسب القسم/);
  assert.match(analyticsPanel, /وليست عددًا موثوقًا للأشخاص الفريدين/);
});

test('admin check is not executable by visitors and tracking RPC is anon-only', () => {
  assert.match(adminCheckRevocation, /revoke all on function public\.is_site_media_admin\(\) from public, anon/i);
  assert.match(adminCheckRevocation, /grant execute on function public\.is_site_media_admin\(\) to authenticated/i);
  assert.match(trackingRoleRestriction, /revoke execute on function public\.record_public_page_view\(text\) from authenticated/i);
});
