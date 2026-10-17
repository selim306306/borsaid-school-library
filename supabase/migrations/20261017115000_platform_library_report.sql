CREATE OR REPLACE FUNCTION public.get_platform_library_report()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  report_time timestamptz := clock_timestamp();
  report_json jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.library_memberships AS membership
    WHERE membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
      AND membership.role = 'owner'
      AND membership.library_id IN (
        'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4'::uuid,
        'c5d10456-1c6e-4bd1-8275-d14e354ac285'::uuid
      )
  ) THEN
    RAISE EXCEPTION 'platform_owner_required' USING ERRCODE = '42501';
  END IF;

  WITH branch_counts AS (
    SELECT library_id, count(*)::bigint AS branches
    FROM public.branches
    GROUP BY library_id
  ), title_counts AS (
    SELECT library_id, count(*)::bigint AS titles
    FROM public.catalog_titles
    GROUP BY library_id
  ), copy_counts AS (
    SELECT
      library_id,
      count(*)::bigint AS copies,
      count(*) FILTER (WHERE status = 'available')::bigint AS available,
      count(*) FILTER (WHERE status = 'lost')::bigint AS lost
    FROM public.holdings
    GROUP BY library_id
  ), loan_counts AS (
    SELECT
      library_id,
      count(*) FILTER (WHERE returned_at IS NULL)::bigint AS open_loans,
      count(*) FILTER (WHERE returned_at IS NULL AND due_at < report_time)::bigint AS overdue_loans
    FROM public.loans
    GROUP BY library_id
  ), reservation_counts AS (
    SELECT
      library_id,
      count(*) FILTER (WHERE status = 'queued')::bigint AS queued_reservations,
      count(*) FILTER (WHERE status = 'ready')::bigint AS ready_reservations
    FROM public.reservations
    GROUP BY library_id
  ), library_metrics AS (
    SELECT
      library.id,
      library.name,
      COALESCE(branch_counts.branches, 0)::bigint AS branches,
      COALESCE(title_counts.titles, 0)::bigint AS titles,
      COALESCE(copy_counts.copies, 0)::bigint AS copies,
      COALESCE(copy_counts.available, 0)::bigint AS available,
      COALESCE(copy_counts.lost, 0)::bigint AS lost,
      COALESCE(loan_counts.open_loans, 0)::bigint AS open_loans,
      COALESCE(loan_counts.overdue_loans, 0)::bigint AS overdue_loans,
      COALESCE(reservation_counts.queued_reservations, 0)::bigint AS queued_reservations,
      COALESCE(reservation_counts.ready_reservations, 0)::bigint AS ready_reservations
    FROM public.libraries AS library
    LEFT JOIN branch_counts ON branch_counts.library_id = library.id
    LEFT JOIN title_counts ON title_counts.library_id = library.id
    LEFT JOIN copy_counts ON copy_counts.library_id = library.id
    LEFT JOIN loan_counts ON loan_counts.library_id = library.id
    LEFT JOIN reservation_counts ON reservation_counts.library_id = library.id
  )
  SELECT jsonb_build_object(
    'generated_at', report_time,
    'scope', 'لقطة حالية لجميع المكتبات المسجلة؛ لا تعرض اتجاهات زمنية، ويُحسب التأخير حتى وقت إنشاء التقرير.',
    'totals', jsonb_build_object(
      'libraries', count(*)::bigint,
      'branches', COALESCE(sum(branches), 0)::bigint,
      'titles', COALESCE(sum(titles), 0)::bigint,
      'copies', COALESCE(sum(copies), 0)::bigint,
      'available', COALESCE(sum(available), 0)::bigint,
      'lost', COALESCE(sum(lost), 0)::bigint,
      'open_loans', COALESCE(sum(open_loans), 0)::bigint,
      'overdue_loans', COALESCE(sum(overdue_loans), 0)::bigint,
      'queued_reservations', COALESCE(sum(queued_reservations), 0)::bigint,
      'ready_reservations', COALESCE(sum(ready_reservations), 0)::bigint
    ),
    'libraries', COALESCE(
      jsonb_agg(jsonb_build_object(
        'name', name,
        'branches', branches,
        'titles', titles,
        'copies', copies,
        'available', available,
        'lost', lost,
        'open_loans', open_loans,
        'overdue_loans', overdue_loans,
        'queued_reservations', queued_reservations,
        'ready_reservations', ready_reservations
      ) ORDER BY name),
      '[]'::jsonb
    )
  )
  INTO report_json
  FROM library_metrics;

  RETURN report_json;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_platform_library_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_library_report() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_platform_library_report() TO authenticated;
