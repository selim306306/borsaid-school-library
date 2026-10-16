-- Allow the site-media owner to manage up to 20 extra banner slides (25 total)
-- and set the public carousel interval. Existing slots and archived assets stay intact.

alter table public.site_media_assets
  drop constraint if exists site_media_assets_media_key_check;
alter table public.site_media_assets
  add constraint site_media_assets_media_key_check
  check (
    media_key = any (array[
      'site-mark', 'site-favicon', 'social-preview',
      'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
      'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
      'leader-project-owner', 'header-feature-image', 'header-feature-image-2',
      'header-feature-image-3', 'header-feature-image-4', 'header-feature-image-5'
    ]::text[])
    or media_key ~ '^header-feature-image-(6|7|8|9|1[0-9]|2[0-5])$'
  );

alter table public.site_media_slots
  drop constraint if exists site_media_slots_media_key_check;
alter table public.site_media_slots
  add constraint site_media_slots_media_key_check
  check (
    media_key = any (array[
      'site-mark', 'site-favicon', 'social-preview',
      'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
      'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
      'leader-project-owner', 'header-feature-image', 'header-feature-image-2',
      'header-feature-image-3', 'header-feature-image-4', 'header-feature-image-5'
    ]::text[])
    or media_key ~ '^header-feature-image-(6|7|8|9|1[0-9]|2[0-5])$'
  );

grant insert, delete on public.site_media_slots to authenticated;

drop policy if exists site_media_slots_admin_gallery_insert on public.site_media_slots;
create policy site_media_slots_admin_gallery_insert
  on public.site_media_slots for insert to authenticated
  with check (
    public.is_site_media_admin()
    and media_key ~ '^header-feature-image-(6|7|8|9|1[0-9]|2[0-5])$'
    and is_published = true
  );

drop policy if exists site_media_slots_admin_gallery_delete on public.site_media_slots;
create policy site_media_slots_admin_gallery_delete
  on public.site_media_slots for delete to authenticated
  using (
    public.is_site_media_admin()
    and media_key ~ '^header-feature-image-(6|7|8|9|1[0-9]|2[0-5])$'
  );

drop policy if exists site_media_objects_admin_insert on storage.objects;
create policy site_media_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and public.is_site_media_admin()
    and name ~ '^media/(site-mark|site-favicon|social-preview|leader-sisi|leader-minister|leader-governor|leader-director|leader-north-admin|leader-library-supervisor|leader-first-supervisor|leader-project-owner|header-feature-image|header-feature-image-2|header-feature-image-3|header-feature-image-4|header-feature-image-5|header-feature-image-(6|7|8|9|1[0-9]|2[0-5]))/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
  );

create table if not exists public.site_banner_settings (
  setting_key text primary key check (setting_key = 'homepage'),
  interval_seconds smallint not null default 8 check (interval_seconds between 2 and 30),
  updated_at timestamptz not null default now()
);

alter table public.site_banner_settings enable row level security;
revoke all on public.site_banner_settings from public, anon, authenticated;
grant select on public.site_banner_settings to anon, authenticated;
grant update (interval_seconds, updated_at) on public.site_banner_settings to authenticated;

drop policy if exists site_banner_settings_public_read on public.site_banner_settings;
create policy site_banner_settings_public_read
  on public.site_banner_settings for select to anon, authenticated
  using (setting_key = 'homepage');

drop policy if exists site_banner_settings_admin_update on public.site_banner_settings;
create policy site_banner_settings_admin_update
  on public.site_banner_settings for update to authenticated
  using (public.is_site_media_admin())
  with check (public.is_site_media_admin() and setting_key = 'homepage');

insert into public.site_banner_settings (setting_key, interval_seconds)
values ('homepage', 8)
on conflict (setting_key) do nothing;
