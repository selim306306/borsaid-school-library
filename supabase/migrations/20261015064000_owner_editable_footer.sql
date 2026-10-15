-- A single public footer string; user content is rendered with textContent in app.js.
create table if not exists public.site_settings (
  setting_key text primary key check (setting_key = 'global_footer'),
  footer_description text not null
    check (char_length(btrim(footer_description)) between 1 and 500),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

drop policy if exists site_settings_public_footer_read on public.site_settings;
create policy site_settings_public_footer_read
  on public.site_settings
  for select
  to anon, authenticated
  using (setting_key = 'global_footer');

drop policy if exists site_settings_school_owners_update on public.site_settings;
create policy site_settings_school_owners_update
  on public.site_settings
  for update
  to authenticated
  using (
    setting_key = 'global_footer'
    and exists (
      select 1
      from public.library_memberships m
      where m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role = 'owner'
        and m.library_id in (
          'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4'::uuid,
          'c5d10456-1c6e-4bd1-8275-d14e354ac285'::uuid
        )
    )
  )
  with check (
    setting_key = 'global_footer'
    and exists (
      select 1
      from public.library_memberships m
      where m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role = 'owner'
        and m.library_id in (
          'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4'::uuid,
          'c5d10456-1c6e-4bd1-8275-d14e354ac285'::uuid
        )
    )
  );

insert into public.site_settings (setting_key, footer_description)
values ('global_footer', 'بوابة رقمية مستقلة لدعم وصول المجتمع المدرسي إلى الكتب.')
on conflict (setting_key) do nothing;
