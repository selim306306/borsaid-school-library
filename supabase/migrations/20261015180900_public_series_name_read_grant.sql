-- The public catalog view is SECURITY INVOKER and exposes only rows allowed by
-- catalog_titles' existing published-row RLS policy. Grant just the new public
-- series metadata column; do not grant table-wide access to anon.
GRANT SELECT (series_name) ON TABLE public.catalog_titles TO anon;
