-- Authenticated users have no direct INSERT grants on catalog_titles/holdings.
-- Keep inserts inside the audited routine: it verifies an active owner/admin/librarian membership,
-- validates every row and branch, writes only catalog metadata/copies, and grants no access to anon.
ALTER FUNCTION public.import_titles_with_holdings(uuid, jsonb) SECURITY DEFINER;
COMMENT ON FUNCTION public.import_titles_with_holdings(uuid, jsonb) IS
  'Scoped spreadsheet import: SECURITY DEFINER is required because authenticated users lack direct table INSERT grants; checks active owner/admin/librarian membership and validates each library branch and catalog field before inserting.';
