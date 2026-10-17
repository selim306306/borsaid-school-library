-- Public read-only summary. Never expose daily rows or visitor records.
-- Existing owner analytics and table RLS/grants are intentionally unchanged.
begin;

create function public.get_public_page_view_totals()
returns table (total_views bigint, today_views bigint, month_views bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with clock as (
    select (pg_catalog.timezone('Africa/Cairo', pg_catalog.now()))::date as today
  )
  select
    coalesce(sum(daily.page_views), 0)::bigint as total_views,
    coalesce(sum(daily.page_views) filter (where daily.view_date = clock.today), 0)::bigint as today_views,
    coalesce(sum(daily.page_views) filter (
      where daily.view_date >= pg_catalog.date_trunc('month', clock.today::timestamp)::date
        and daily.view_date <= clock.today
    ), 0)::bigint as month_views
  from public.site_page_view_daily as daily
  cross join clock
  where daily.view_date >= clock.today - 400
    and daily.view_date <= clock.today
  limit 1;
$function$;

revoke all on function public.get_public_page_view_totals() from public;
grant execute on function public.get_public_page_view_totals() to anon, authenticated, service_role;
comment on function public.get_public_page_view_totals() is
  'Only aggregate section page-view totals (retained history, Cairo today/current month); not unique visitors. No raw rows or personal data.';

commit;
