-- Public-source design evidence only; no user records, images, names or site edits.
CREATE TABLE private.admin_agent_design_report (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  report jsonb NOT NULL,
  source_hash text NOT NULL,
  issues_fingerprint text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.admin_agent_design_report ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.admin_agent_design_report FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_agent_record_design(p_report jsonb, p_manual boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_old private.admin_agent_design_report%ROWTYPE;
  v_check jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_report jsonb;
  v_issue_keys jsonb;
  v_fingerprint text;
  v_notify boolean := false;
  v_id uuid;
  v_hash text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_report IS NULL OR pg_column_size(p_report)>32768 OR jsonb_typeof(p_report->'checks') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_report->'checks')>24 THEN
    RAISE EXCEPTION 'invalid_design_report' USING ERRCODE='22023';
  END IF;
  v_hash := p_report->>'source_hash';
  IF v_hash IS NULL OR v_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_design_fingerprint' USING ERRCODE='22023';
  END IF;
  FOR v_check IN SELECT value FROM jsonb_array_elements(p_report->'checks') LIMIT 24 LOOP
    IF (v_check->>'status') IS NULL OR (v_check->>'status') NOT IN ('pass','attention','not_verified') THEN
      RAISE EXCEPTION 'invalid_design_status' USING ERRCODE='22023';
    END IF;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'id',left(v_check->>'id',64),'label',left(v_check->>'label',100),
      'status',v_check->>'status','evidence',left(v_check->>'evidence',600),
      'suggestion',left(v_check->>'suggestion',600)
    ));
  END LOOP;
  SELECT coalesce(jsonb_agg(c->>'id' ORDER BY c->>'id'),'[]'::jsonb)
    INTO v_issue_keys FROM jsonb_array_elements(v_checks) c WHERE c->>'status'='attention';
  v_fingerprint := encode(extensions.digest(v_issue_keys::text,'sha256'),'hex');
  v_report := jsonb_build_object('version',1,'checks',v_checks,'source_hash',v_hash,
    'needs_attention',jsonb_array_length(v_issue_keys)>0,
    'limitation','فحص HTML/CSS فقط؛ الهرمية البصرية والتجاوب الفعلي وسهولة الاستخدام تحتاج مراجعة متصفح. لا يُنشر أي تعديل مرئي تلقائيًا.',
    'checked_at',clock_timestamp());
  PERFORM pg_advisory_xact_lock(hashtextextended('library-admin-design-review',0));
  SELECT * INTO v_old FROM private.admin_agent_design_report WHERE id=true FOR UPDATE;
  v_notify := v_old.id IS TRUE AND v_old.source_hash IS DISTINCT FROM v_hash
    AND v_old.issues_fingerprint IS DISTINCT FROM v_fingerprint
    AND jsonb_array_length(v_issue_keys)>0 AND NOT p_manual;
  INSERT INTO private.admin_agent_design_report(id,report,source_hash,issues_fingerprint,updated_at)
    VALUES(true,v_report,v_hash,v_fingerprint,clock_timestamp())
    ON CONFLICT(id) DO UPDATE SET report=excluded.report,source_hash=excluded.source_hash,
      issues_fingerprint=excluded.issues_fingerprint,updated_at=excluded.updated_at;
  IF v_notify THEN
    INSERT INTO private.admin_agent_monitor_deliveries(delivery_day,status)
      VALUES((clock_timestamp() AT TIME ZONE 'Africa/Cairo')::date,'pending')
      ON CONFLICT(delivery_day) DO NOTHING RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('report',v_report,'changed',v_old.source_hash IS DISTINCT FROM v_hash,
    'meaningful_change',v_notify,'notification_id',v_id);
END
$function$;
REVOKE ALL ON FUNCTION public.admin_agent_record_design(jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_agent_record_design(jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_agent_design_status(p_library_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_report jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_library_id IS NULL
      OR NOT public.has_library_role(p_library_id,ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  SELECT r.report INTO v_report FROM private.admin_agent_design_report r WHERE id=true LIMIT 1;
  RETURN coalesce(v_report,jsonb_build_object('checks','[]'::jsonb,
    'limitation','لم يُحفظ فحص تصميم تقني بعد. الفحص البصري الكامل يحتاج متصفحًا.'));
END
$function$;
REVOKE ALL ON FUNCTION public.admin_agent_design_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agent_design_status(uuid) TO authenticated;
