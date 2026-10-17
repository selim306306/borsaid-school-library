import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261017224716_library_admin_agent.sql', import.meta.url), 'utf8');

test('defines the authenticated-only SECURITY DEFINER contract and auth scope', () => {
  assert.match(sql, /public\.library_admin_agent\(\s*p_library_id uuid,\s*p_action text DEFAULT 'review',\s*p_run_id uuid DEFAULT NULL\s*\)/i);
  assert.match(sql, /returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /has_library_role\(p_library_id, ARRAY\['owner','admin'\]/i);
  assert.match(sql, /revoke all on function public\.library_admin_agent\(uuid, text, uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.library_admin_agent\(uuid, text, uuid\) to authenticated/i);
});

test('review is aggregate-only, bounded history, and excludes private snapshots', () => {
  assert.match(sql, /'metrics'/);
  for (const key of ['titles', 'missing_author', 'missing_classification', 'missing_isbn', 'whitespace_candidates']) assert.match(sql, new RegExp(`'${key}'`));
  assert.match(sql, /limit 10/i);
  assert.match(sql, /'history'/);
  assert.match(sql, /'id'.*'action'.*'changed_count'.*'created_at'.*'undone_at'/s);
  assert.doesNotMatch(sql, /history[\s\S]{0,800}before_values/i);
});

test('normalization is capped, null-preserving, and limited to three fields', () => {
  assert.match(sql, /limit 100\s+for update/i);
  assert.match(sql, /regexp_replace\([^;]*'\[ \\t\\n\\r\\f\]\+'/s);
  assert.match(sql, /CASE WHEN v_title\.title IS NULL THEN NULL/);
  assert.match(sql, /CASE WHEN v_title\.author IS NULL THEN NULL/);
  assert.match(sql, /CASE WHEN v_title\.series_name IS NULL THEN NULL/);
  assert.match(sql, /UPDATE public\.catalog_titles SET title = .*author = .*series_name =/s);
  const catalogSetClauses = [...sql.matchAll(/UPDATE public\.catalog_titles SET ([^;]+?)(?=\s+WHERE)/gi)].map((match) => match[1]);
  assert.ok(catalogSetClauses.length >= 2);
  for (const clause of catalogSetClauses) assert.doesNotMatch(clause, /\b(?:isbn|classification|library_id|is_published)\s*=/i);
  assert.doesNotMatch(sql, /(?:students|loans|memberships)[\s\S]*UPDATE/i);
});

test('run ledger and snapshots enforce idempotency, conflict-safe undo, and private RLS', () => {
  assert.match(sql, /private\.library_admin_agent_runs/);
  assert.match(sql, /private\.library_admin_agent_snapshots/);
  assert.match(sql, /UNIQUE \(run_id, title_id\)/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /before_values jsonb/i);
  assert.match(sql, /after_values jsonb/i);
  assert.match(sql, /undone_at/);
  assert.match(sql, /run_conflict/);
  assert.match(sql, /already_applied/);
  assert.match(sql, /already_undone/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /FOR SELECT TO authenticated/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.library_admin_agent_runs, private\.library_admin_agent_snapshots FROM PUBLIC, anon, authenticated/i);
});

test('validation rejects null actions and normalize creates its parent run before snapshots', () => {
  assert.match(sql, /p_action IS NULL OR p_action NOT IN \('review', 'normalize', 'undo'\)/i);

  const normalizeStart = sql.indexOf("IF p_action = 'normalize' THEN");
  const loopStart = sql.indexOf('FOR v_title IN', normalizeStart);
  const initialRunInsert = sql.indexOf("VALUES (p_run_id, p_library_id, v_actor, 'normalize', 0)", normalizeStart);
  const countUpdate = sql.indexOf('SET changed_count = v_changed', normalizeStart);
  assert.ok(normalizeStart >= 0 && initialRunInsert > normalizeStart);
  assert.ok(initialRunInsert < loopStart, 'the parent run must precede snapshot inserts');
  assert.ok(loopStart < countUpdate, 'the final count update must follow the normalization loop');
  assert.equal((sql.match(/INSERT INTO private\.library_admin_agent_runs\(/g) ?? []).length, 1);
});

test('normalize detects UUID collisions outside the request scope and preserves undone status', () => {
  assert.match(sql, /WHERE r\.id = p_run_id\s+FOR UPDATE/i);
  assert.match(sql, /v_existing\.library_id IS DISTINCT FROM p_library_id/);
  assert.ok((sql.match(/RAISE EXCEPTION 'run_id_conflict'/gi) ?? []).length >= 2);
  assert.match(sql, /'already_applied', true,[\s\S]{0,180}'already_undone', v_existing\.undone_at IS NOT NULL/i);
});

test('undo locks each catalog row before comparing it and treats a missing row as a conflict', () => {
  const undoStart = sql.indexOf("SELECT * INTO v_existing FROM private.library_admin_agent_runs r", sql.indexOf("IF p_action = 'normalize' THEN") + 1);
  const undoBody = sql.slice(undoStart);
  assert.match(undoBody, /SELECT t\.\* INTO v_catalog[\s\S]*FROM public\.catalog_titles t[\s\S]*FOR UPDATE/i);
  assert.match(undoBody, /IF NOT FOUND\s+OR\s+v_catalog\.title IS DISTINCT FROM/i);
  assert.doesNotMatch(undoBody, /IF NOT EXISTS \(SELECT 1 FROM public\.catalog_titles/i);
});
