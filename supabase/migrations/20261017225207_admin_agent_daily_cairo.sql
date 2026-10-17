-- Daily 09:00 Africa/Cairo, including Egyptian daylight-saving transitions.
-- Cron evaluates two UTC candidate hours; the guard permits one actual review only.
ALTER TABLE private.admin_agent_monitor_config DROP CONSTRAINT admin_agent_monitor_config_interval_hours_check;
ALTER TABLE private.admin_agent_monitor_config ALTER COLUMN interval_hours SET DEFAULT 24;
UPDATE private.admin_agent_monitor_config SET interval_hours=24, next_review_help=NULL, updated_at=now() WHERE id=true;
ALTER TABLE private.admin_agent_monitor_config ADD CONSTRAINT admin_agent_monitor_config_interval_hours_check CHECK (interval_hours=24);
CREATE OR REPLACE FUNCTION public.admin_agent_monitor_tick(
  p_key text,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_secret text;
  v_expected bytea;
  v_actual bytea;
  v_diff integer := 0;
  v_config private.admin_agent_monitor_config%ROWTYPE;
  v_last timestamptz;
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now AT TIME ZONE 'Africa/Cairo')::date;
  v_notification_id uuid;
  v_metrics jsonb;
  v_notify boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 128 OR p_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'invalid_monitor_key' USING ERRCODE = '22023';
  END IF;
  v_secret := private.library_admin_monitor_secret();
  IF v_secret IS NULL OR length(v_secret) > 128 THEN
    RAISE EXCEPTION 'monitor_not_configured' USING ERRCODE = '55000';
  END IF;
  v_expected := extensions.digest(v_secret, 'sha256');
  v_actual := extensions.digest(p_key, 'sha256');
  FOR i IN 0..(length(v_expected) - 1) LOOP
    v_diff := v_diff | (get_byte(v_expected, i) # get_byte(v_actual, i));
  END LOOP;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'invalid_monitor_key' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_config FROM private.admin_agent_monitor_config WHERE id = true FOR UPDATE;
  IF NOT FOUND OR NOT v_config.enabled THEN
    RETURN jsonb_build_object('metrics', jsonb_build_object('titles',0,'missing_author',0,'missing_classification',0,'missing_isbn',0,'whitespace_candidates',0), 'notification_id', NULL, 'notify', false, 'status', 'disabled');
  END IF;
  v_last := v_config.last_checked_at;
  IF NOT p_dry_run AND v_last IS NOT NULL AND v_now < v_last + interval '20 hours' THEN
    RETURN jsonb_build_object('metrics', jsonb_build_object('titles',0,'missing_author',0,'missing_classification',0,'missing_isbn',0,'whitespace_candidates',0), 'notification_id', NULL, 'notify', false, 'status', 'cooldown');
  END IF;

  SELECT jsonb_build_object(
    'titles', count(*),
    'missing_author', count(*) FILTER (WHERE nullif(btrim(author), '') IS NULL),
    'missing_classification', count(*) FILTER (WHERE nullif(btrim(classification), '') IS NULL),
    'missing_isbn', count(*) FILTER (WHERE nullif(btrim(isbn), '') IS NULL),
    'whitespace_candidates', count(*) FILTER (WHERE
      (title IS NOT NULL AND title IS DISTINCT FROM btrim(regexp_replace(title, '[ \t\n\r\f]+', ' ', 'g'), ' ')) OR
      (author IS NOT NULL AND author IS DISTINCT FROM btrim(regexp_replace(author, '[ \t\n\r\f]+', ' ', 'g'), ' ')) OR
      (series_name IS NOT NULL AND series_name IS DISTINCT FROM btrim(regexp_replace(series_name, '[ \t\n\r\f]+', ' ', 'g'), ' '))
    )
  ) INTO v_metrics
  FROM public.catalog_titles
  WHERE library_id IN ('a70f6fa4-0dc1-4612-9280-6c2a8e049dd4'::uuid, 'c5d10456-1c6e-4bd1-8275-d14e354ac285'::uuid);

  IF p_dry_run THEN
    RETURN jsonb_build_object('metrics', v_metrics, 'notification_id', NULL, 'notify', false, 'status', 'dry_run');
  END IF;

  UPDATE private.admin_agent_monitor_config
    SET last_checked_at = v_now, next_review_help = (((v_now AT TIME ZONE 'Africa/Cairo')::date + 1 + time '09:00') AT TIME ZONE 'Africa/Cairo'), updated_at = v_now
    WHERE id = true;
  IF (v_metrics->>'titles')::integer = 0 OR ((v_metrics->>'missing_author')::integer + (v_metrics->>'missing_classification')::integer + (v_metrics->>'missing_isbn')::integer) > 0 THEN
    INSERT INTO private.admin_agent_monitor_deliveries (delivery_day, status)
    VALUES (v_day, 'pending')
    ON CONFLICT (delivery_day) DO NOTHING
    RETURNING id INTO v_notification_id;
    v_notify := v_notification_id IS NOT NULL;
  END IF;
  RETURN jsonb_build_object('metrics', v_metrics, 'notification_id', v_notification_id, 'notify', v_notify, 'status', 'ok');
END
$function$;
REVOKE ALL ON FUNCTION public.admin_agent_monitor_tick(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_agent_monitor_tick(text, boolean) TO service_role;


CREATE OR REPLACE FUNCTION public.admin_agent_monitor_status(p_library_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_config private.admin_agent_monitor_config%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_library_id IS NULL OR NOT public.has_library_role(p_library_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_library_id NOT IN ('a70f6fa4-0dc1-4612-9280-6c2a8e049dd4'::uuid, 'c5d10456-1c6e-4bd1-8275-d14e354ac285'::uuid) THEN
    RETURN jsonb_build_object('configured', false, 'enabled', false, 'interval_hours', 24);
  END IF;
  SELECT * INTO v_config FROM private.admin_agent_monitor_config WHERE id = true;
  RETURN jsonb_build_object(
    'configured', v_config.id IS TRUE,
    'enabled', coalesce(v_config.enabled, false),
    'interval_hours', coalesce(v_config.interval_hours, 24),
    'last_checked_at', v_config.last_checked_at,
    'last_delivery_status', (SELECT d.status FROM private.admin_agent_monitor_deliveries d ORDER BY d.created_at DESC LIMIT 1),
    'schedule_timezone', 'Africa/Cairo',
    'local_time', '09:00',
    'next_review_help', v_config.next_review_help
  );
END
$function$;
REVOKE ALL ON FUNCTION public.admin_agent_monitor_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agent_monitor_status(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION private.library_admin_monitor_schedule()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_request_id bigint;
BEGIN
  IF extract(hour FROM clock_timestamp() AT TIME ZONE 'Africa/Cairo') <> 9 THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.admin_agent_monitor_config c
      WHERE c.id=true AND c.enabled AND (c.last_checked_at IS NULL
        OR (c.last_checked_at AT TIME ZONE 'Africa/Cairo')::date < (clock_timestamp() AT TIME ZONE 'Africa/Cairo')::date)) THEN
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url := 'https://eahptkwvjcnixlzlyznh.supabase.co/functions/v1/library-admin-monitor',
    headers := jsonb_build_object('Content-Type','application/json','x-monitor-key',private.library_admin_monitor_secret()),
    body := '{}'::jsonb, timeout_milliseconds := 30000
  ) INTO v_request_id;
  RETURN v_request_id;
END
$function$;
REVOKE ALL ON FUNCTION private.library_admin_monitor_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.library_admin_monitor_schedule() TO postgres;
DO $cron$
DECLARE v_job bigint;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='library-admin-monitor-every-2-hours' LOOP
    PERFORM cron.unschedule(v_job);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='library-admin-monitor-daily-cairo') THEN
    PERFORM cron.schedule('library-admin-monitor-daily-cairo', '0 6,7 * * *', $$SELECT private.library_admin_monitor_schedule();$$);
  END IF;
END
$cron$;
