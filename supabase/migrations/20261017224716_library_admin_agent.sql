-- Library catalog cleanup agent: authenticated owner/admin only.
-- This migration does not touch student, loan, or membership records.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.library_admin_agent_runs (
  id uuid PRIMARY KEY,
  library_id uuid NOT NULL REFERENCES public.libraries(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('normalize')),
  changed_count integer NOT NULL CHECK (changed_count >= 0 AND changed_count <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);

CREATE TABLE IF NOT EXISTS private.library_admin_agent_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES private.library_admin_agent_runs(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.catalog_titles(id) ON DELETE CASCADE,
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL,
  UNIQUE (run_id, title_id)
);

ALTER TABLE private.library_admin_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.library_admin_agent_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_admin_agent_runs_read ON private.library_admin_agent_runs;
CREATE POLICY library_admin_agent_runs_read ON private.library_admin_agent_runs
  FOR SELECT TO authenticated
  USING (public.has_library_role(library_id, ARRAY['owner','admin']::text[]));

DROP POLICY IF EXISTS library_admin_agent_snapshots_read ON private.library_admin_agent_snapshots;
CREATE POLICY library_admin_agent_snapshots_read ON private.library_admin_agent_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM private.library_admin_agent_runs r
    WHERE r.id = run_id
      AND public.has_library_role(r.library_id, ARRAY['owner','admin']::text[])
  ));

REVOKE ALL ON TABLE private.library_admin_agent_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.library_admin_agent_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE private.library_admin_agent_runs, private.library_admin_agent_snapshots TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE private.library_admin_agent_runs, private.library_admin_agent_snapshots FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS library_admin_agent_run_idempotency
  ON private.library_admin_agent_runs (library_id, actor_id, action, id);

CREATE OR REPLACE FUNCTION public.library_admin_agent(
  p_library_id uuid,
  p_action text DEFAULT 'review',
  p_run_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_existing private.library_admin_agent_runs%ROWTYPE;
  v_changed integer := 0;
  v_title record;
  v_catalog record;
  v_before jsonb;
  v_after jsonb;
  v_history jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_library_id IS NULL OR NOT public.has_library_role(p_library_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('review', 'normalize', 'undo') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  IF p_action IN ('normalize', 'undo') AND p_run_id IS NULL THEN
    RAISE EXCEPTION 'run_id_required' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'review' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', h.id, 'action', h.action, 'changed_count', h.changed_count,
      'created_at', h.created_at, 'undone_at', h.undone_at
      ) ORDER BY h.created_at DESC) INTO v_history
    FROM (
      SELECT r.id, r.action, r.changed_count, r.created_at, r.undone_at
      FROM private.library_admin_agent_runs r
      WHERE r.library_id = p_library_id
      ORDER BY r.created_at DESC
      LIMIT 10
    ) h;
    RETURN jsonb_build_object(
      'metrics', jsonb_build_object(
        'titles', (SELECT count(*) FROM public.catalog_titles t WHERE t.library_id = p_library_id),
        'missing_author', (SELECT count(*) FROM public.catalog_titles t WHERE t.library_id = p_library_id AND nullif(btrim(t.author), '') IS NULL),
        'missing_classification', (SELECT count(*) FROM public.catalog_titles t WHERE t.library_id = p_library_id AND nullif(btrim(t.classification), '') IS NULL),
        'missing_isbn', (SELECT count(*) FROM public.catalog_titles t WHERE t.library_id = p_library_id AND nullif(btrim(t.isbn), '') IS NULL),
        'whitespace_candidates', (SELECT count(*) FROM public.catalog_titles t WHERE t.library_id = p_library_id AND (
          (t.title IS NOT NULL AND t.title IS DISTINCT FROM btrim(pg_catalog.regexp_replace(t.title, '[ \t\n\r\f]+', ' ', 'g'), ' ')) OR
          (t.author IS NOT NULL AND t.author IS DISTINCT FROM btrim(pg_catalog.regexp_replace(t.author, '[ \t\n\r\f]+', ' ', 'g'), ' ')) OR
          (t.series_name IS NOT NULL AND t.series_name IS DISTINCT FROM btrim(pg_catalog.regexp_replace(t.series_name, '[ \t\n\r\f]+', ' ', 'g'), ' '))
        ))
      ),
      'history', coalesce(v_history, '[]'::jsonb)
    );
  END IF;

  -- Serialize all agent runs for this library, then lock the target rows.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_library_id::text, 0));

  IF p_action = 'normalize' THEN
    SELECT * INTO v_existing FROM private.library_admin_agent_runs r
    WHERE r.id = p_run_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.library_id IS DISTINCT FROM p_library_id
        OR v_existing.actor_id IS DISTINCT FROM v_actor
        OR v_existing.action IS DISTINCT FROM 'normalize' THEN
        RAISE EXCEPTION 'run_id_conflict' USING ERRCODE = '23505';
      END IF;
      RETURN jsonb_build_object(
        'run_id', p_run_id,
        'changed_count', v_existing.changed_count,
        'already_applied', true,
        'already_undone', v_existing.undone_at IS NOT NULL
      );
    END IF;

    INSERT INTO private.library_admin_agent_runs(id, library_id, actor_id, action, changed_count)
    VALUES (p_run_id, p_library_id, v_actor, 'normalize', 0);

    FOR v_title IN
      SELECT t.id, t.title, t.author, t.series_name
      FROM public.catalog_titles t
      WHERE t.library_id = p_library_id
        AND ((t.title IS NOT NULL AND t.title IS DISTINCT FROM btrim(pg_catalog.regexp_replace(t.title, '[ \t\n\r\f]+', ' ', 'g'), ' '))
          OR (t.author IS NOT NULL AND t.author IS DISTINCT FROM btrim(pg_catalog.regexp_replace(t.author, '[ \t\n\r\f]+', ' ', 'g'), ' '))
          OR (t.series_name IS NOT NULL AND t.series_name IS DISTINCT FROM btrim(pg_catalog.regexp_replace(t.series_name, '[ \t\n\r\f]+', ' ', 'g'), ' ')))
      ORDER BY t.id
      LIMIT 100
      FOR UPDATE
    LOOP
      v_before := jsonb_build_object('title', v_title.title, 'author', v_title.author, 'series_name', v_title.series_name);
      v_after := jsonb_build_object(
        'title', CASE WHEN v_title.title IS NULL THEN NULL ELSE btrim(pg_catalog.regexp_replace(v_title.title, '[ \t\n\r\f]+', ' ', 'g'), ' ') END,
        'author', CASE WHEN v_title.author IS NULL THEN NULL ELSE btrim(pg_catalog.regexp_replace(v_title.author, '[ \t\n\r\f]+', ' ', 'g'), ' ') END,
        'series_name', CASE WHEN v_title.series_name IS NULL THEN NULL ELSE btrim(pg_catalog.regexp_replace(v_title.series_name, '[ \t\n\r\f]+', ' ', 'g'), ' ') END
      );
      INSERT INTO private.library_admin_agent_snapshots(run_id, title_id, before_values, after_values)
      VALUES (p_run_id, v_title.id, v_before, v_after);
      UPDATE public.catalog_titles SET title = v_after->>'title', author = v_after->>'author', series_name = v_after->>'series_name' WHERE id = v_title.id AND library_id = p_library_id;
      v_changed := v_changed + 1;
    END LOOP;
    UPDATE private.library_admin_agent_runs
    SET changed_count = v_changed
    WHERE id = p_run_id;
    RETURN jsonb_build_object('run_id', p_run_id, 'changed_count', v_changed, 'already_applied', false);
  END IF;

  SELECT * INTO v_existing FROM private.library_admin_agent_runs r
  WHERE r.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_existing.library_id IS DISTINCT FROM p_library_id
    OR v_existing.actor_id IS DISTINCT FROM v_actor
    OR v_existing.action IS DISTINCT FROM 'normalize' THEN
    RAISE EXCEPTION 'run_id_conflict' USING ERRCODE = '23505';
  END IF;
  IF v_existing.undone_at IS NOT NULL THEN
    RETURN jsonb_build_object('run_id', p_run_id, 'changed_count', 0, 'already_undone', true);
  END IF;

  FOR v_title IN
    SELECT s.title_id, s.before_values, s.after_values
    FROM private.library_admin_agent_snapshots s
    WHERE s.run_id = p_run_id
    ORDER BY s.title_id
    FOR UPDATE
  LOOP
    SELECT t.* INTO v_catalog
    FROM public.catalog_titles t
    WHERE t.id = v_title.title_id AND t.library_id = p_library_id
    FOR UPDATE;
    IF NOT FOUND
      OR v_catalog.title IS DISTINCT FROM v_title.after_values->>'title'
      OR v_catalog.author IS DISTINCT FROM v_title.after_values->>'author'
      OR v_catalog.series_name IS DISTINCT FROM v_title.after_values->>'series_name' THEN
      RAISE EXCEPTION 'run_conflict' USING ERRCODE = '40001';
    END IF;
    UPDATE public.catalog_titles SET title = v_title.before_values->>'title', author = v_title.before_values->>'author', series_name = v_title.before_values->>'series_name'
      WHERE id = v_title.title_id AND library_id = p_library_id;
    v_changed := v_changed + 1;
  END LOOP;
  UPDATE private.library_admin_agent_runs SET undone_at = now() WHERE id = p_run_id;
  RETURN jsonb_build_object('run_id', p_run_id, 'changed_count', v_changed, 'already_undone', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.library_admin_agent(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.library_admin_agent(uuid, text, uuid) TO authenticated;
