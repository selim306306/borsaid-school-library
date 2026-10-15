-- Keep the existing membership assertion and let the caller's authenticated role
-- perform reads/inserts under the catalog_titles_staff_insert and holdings_staff_insert RLS policies.
ALTER FUNCTION public.import_titles_with_holdings(uuid, jsonb) SECURITY INVOKER;
