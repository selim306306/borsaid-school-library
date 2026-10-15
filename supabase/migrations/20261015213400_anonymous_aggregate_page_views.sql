-- Daily anonymous page-view totals for whitelisted public site sections only.
-- No visitor, browser, IP, referrer, question, or library-record identifiers are stored.

create table public.site_page_view_daily (
  view_date date not null,
  section text not null check (section in (
    'home',
    'discover',
    'branches',
    'announcements',
    'about',
    'reading',
    'educationResearch'
  )),
  page_views bigint not null default 0 check (page_views >= 0),
  primary key (view_date, section)
);

alter table public.site_page_view_daily enable row level security;

revoke all on public.site_page_view_daily from PUBLIC, anon, authenticated;
grant select on public.site_page_view_daily to authenticated;

create policy site_page_view_daily_site_admin_read
  on public.site_page_view_daily
  for select to authenticated
  using (public.is_site_media_admin());

create or replace function public.record_public_page_view(p_section text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (pg_catalog.timezone('Africa/Cairo', pg_catalog.now()))::date;
begin
  if p_section is null or p_section not in (
    'home',
    'discover',
    'branches',
    'announcements',
    'about',
    'reading',
    'educationResearch'
  ) then
    raise exception 'Unsupported public section.' using errcode = '22023';
  end if;

  insert into public.site_page_view_daily as daily (view_date, section, page_views)
  values (v_today, p_section, 1)
  on conflict (view_date, section)
  do update set page_views = daily.page_views + 1;

  -- Keep only a rolling 400-day aggregate history.
  delete from public.site_page_view_daily
  where view_date < v_today - 400;
end;
$function$;

revoke all on function public.record_public_page_view(text) from PUBLIC, anon, authenticated;
grant execute on function public.record_public_page_view(text) to anon, authenticated;
