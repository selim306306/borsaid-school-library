-- Metadata-only hardening: no application rows or RLS policies are changed.
-- Public visitors only read public profiles; authenticated owners use
-- SELECT/INSERT/UPDATE through existing RLS policies. School deletion is
-- handled by the existing, owner-checked SECURITY DEFINER RPC.
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRUNCATE, TRIGGER
  ON TABLE public.library_profiles FROM anon;
REVOKE DELETE, REFERENCES, TRUNCATE, TRIGGER
  ON TABLE public.library_profiles FROM authenticated;

-- Expected remaining grants: anon SELECT; authenticated SELECT/INSERT/UPDATE.
-- Inspect with has_table_privilege; never test by truncating or mutating data.
