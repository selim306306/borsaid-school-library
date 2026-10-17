-- Atomically add an invited user's membership without overwriting a concurrent membership.
CREATE OR REPLACE FUNCTION public.create_invited_library_membership(
  p_library_id uuid,
  p_user_id uuid,
  p_new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_library_id IS NULL OR p_user_id IS NULL OR p_new_role IS NULL THEN
    RAISE EXCEPTION 'membership_arguments_required' USING ERRCODE = '22023';
  END IF;
  IF p_new_role NOT IN ('admin', 'librarian', 'circulation', 'reporter') THEN
    RAISE EXCEPTION 'invalid_membership_role' USING ERRCODE = '22023';
  END IF;

  -- Serialize this insert with manage_library_membership for the same library.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_library_id::text, 0)
  );

  IF NOT public.can_manage_library_members(p_library_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT m.role INTO actor_role
  FROM public.library_memberships AS m
  WHERE m.library_id = p_library_id
    AND m.user_id = auth.uid()
    AND m.status = 'active';

  IF actor_role = 'admin' AND p_new_role = 'admin' THEN
    RAISE EXCEPTION 'admin_cannot_invite_admin' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.library_memberships (library_id, user_id, role, status)
  VALUES (p_library_id, p_user_id, p_new_role, 'active');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invited_library_membership(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_invited_library_membership(uuid, uuid, text)
  TO authenticated;
