-- Owner-only, preview-first permanent deletion for one owned library.
-- The delete RPC compares the confirmed impact snapshot, removes child records in FK-safe order,
-- deletes the linked audit history, and preserves the user's other active owner memberships.
CREATE OR REPLACE FUNCTION public._owned_school_deletion_counts(
  p_library_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'libraries', 1,
    'library_profiles', (SELECT count(*) FROM public.library_profiles p WHERE p.library_id = p_library_id),
    'library_memberships', (SELECT count(*) FROM public.library_memberships m WHERE m.library_id = p_library_id),
    'branches', (SELECT count(*) FROM public.branches b WHERE b.library_id = p_library_id),
    'catalog_titles', (SELECT count(*) FROM public.catalog_titles t WHERE t.library_id = p_library_id),
    'holdings', (SELECT count(*) FROM public.holdings h WHERE h.library_id = p_library_id),
    'inventory_checks', (SELECT count(*) FROM public.inventory_checks i WHERE i.library_id = p_library_id),
    'patrons', (SELECT count(*) FROM public.patrons p WHERE p.library_id = p_library_id),
    'loans', (SELECT count(*) FROM public.loans l WHERE l.library_id = p_library_id),
    'reservations', (SELECT count(*) FROM public.reservations r WHERE r.library_id = p_library_id),
    'visitors', (SELECT count(*) FROM public.visitors v WHERE v.library_id = p_library_id),
    'interlibrary_requests', (SELECT count(*) FROM public.interlibrary_requests r WHERE r.source_library_id = p_library_id OR r.destination_library_id = p_library_id),
    'incoming_external_requests', (SELECT count(*) FROM public.interlibrary_requests r WHERE r.destination_library_id = p_library_id AND r.source_library_id <> p_library_id),
    'audit_log', (SELECT count(*) FROM public.audit_log a WHERE a.library_id = p_library_id),
    'remaining_owned_libraries', (SELECT count(*) FROM public.library_memberships m WHERE m.user_id = p_actor_id AND m.role = 'owner' AND m.status = 'active' AND m.library_id <> p_library_id)
  )
  FROM public.libraries l
  WHERE l.id = p_library_id;
$function$;

REVOKE ALL ON FUNCTION public._owned_school_deletion_counts(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_owned_school_deletion(p_library_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  school_name text;
  impact_counts jsonb;
  storage_file_count bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_library_id IS NULL THEN
    RAISE EXCEPTION 'library_id_required' USING ERRCODE = '22023';
  END IF;

  SELECT l.name INTO school_name
  FROM public.libraries l
  WHERE l.id = p_library_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'school_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.library_id = p_library_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_library_owner_required' USING ERRCODE = '42501';
  END IF;

  impact_counts := public._owned_school_deletion_counts(p_library_id, auth.uid());
  SELECT count(*) INTO storage_file_count
  FROM storage.objects o
  WHERE o.bucket_id = 'school-branding'
    AND o.name LIKE p_library_id::text || '/%';

  RETURN jsonb_build_object(
    'library_id', p_library_id,
    'school_name', school_name,
    'counts', impact_counts,
    'storage_files', storage_file_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_owned_school_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_owned_school_deletion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_owned_school(
  p_library_id uuid,
  p_expected_counts jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_counts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_library_id IS NULL OR p_expected_counts IS NULL THEN
    RAISE EXCEPTION 'library_id_and_confirmed_impact_required' USING ERRCODE = '22023';
  END IF;

  -- Serialize deletion against new library-linked inserts and concurrent changes.
  PERFORM 1 FROM public.libraries l WHERE l.id = p_library_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'school_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.library_id = p_library_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active_library_owner_required' USING ERRCODE = '42501';
  END IF;

  -- Lock rows used by composite foreign keys so counts remain stable through the transaction.
  PERFORM 1 FROM public.library_memberships m WHERE m.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.branches b WHERE b.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.catalog_titles t WHERE t.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.holdings h WHERE h.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.patrons p WHERE p.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.loans l WHERE l.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.reservations r WHERE r.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.interlibrary_requests r WHERE r.source_library_id = p_library_id OR r.destination_library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.inventory_checks i WHERE i.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.visitors v WHERE v.library_id = p_library_id FOR UPDATE;
  PERFORM 1 FROM public.library_profiles p WHERE p.library_id = p_library_id FOR UPDATE;

  current_counts := public._owned_school_deletion_counts(p_library_id, auth.uid());
  IF current_counts IS DISTINCT FROM p_expected_counts THEN
    RAISE EXCEPTION 'impact_changed' USING ERRCODE = '40001';
  END IF;
  IF coalesce((current_counts ->> 'incoming_external_requests')::bigint, 0) > 0 THEN
    RAISE EXCEPTION 'school_has_external_requests' USING ERRCODE = '55000';
  END IF;
  IF coalesce((current_counts ->> 'remaining_owned_libraries')::bigint, 0) < 1 THEN
    RAISE EXCEPTION 'last_owned_library' USING ERRCODE = '55000';
  END IF;

  -- Remove children before parents where the current schema uses NO ACTION references.
  DELETE FROM public.interlibrary_requests r
  WHERE r.source_library_id = p_library_id OR r.destination_library_id = p_library_id;
  DELETE FROM public.reservations r WHERE r.library_id = p_library_id;
  DELETE FROM public.loans l WHERE l.library_id = p_library_id;
  DELETE FROM public.inventory_checks i WHERE i.library_id = p_library_id;
  DELETE FROM public.holdings h WHERE h.library_id = p_library_id;
  DELETE FROM public.patrons p WHERE p.library_id = p_library_id;
  DELETE FROM public.visitors v WHERE v.library_id = p_library_id;
  DELETE FROM public.catalog_titles t WHERE t.library_id = p_library_id;
  DELETE FROM public.branches b WHERE b.library_id = p_library_id;
  DELETE FROM public.library_profiles p WHERE p.library_id = p_library_id;
  DELETE FROM public.library_memberships m WHERE m.library_id = p_library_id;
  -- Delete linked history only after child deletion triggers have recorded their actions.
  DELETE FROM public.audit_log a WHERE a.library_id = p_library_id;
  DELETE FROM public.libraries l WHERE l.id = p_library_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'school_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_owned_school(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_owned_school(uuid, jsonb) TO authenticated;
