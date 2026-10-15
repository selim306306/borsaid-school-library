-- Add one owner-managed, optional image slot below the site flag.
-- This does not alter school profiles, publications, books, branches, or news timing.

alter table public.site_media_assets
  drop constraint if exists site_media_assets_media_key_check;
alter table public.site_media_assets
  add constraint site_media_assets_media_key_check
  check (media_key = any (array[
    'site-mark', 'site-favicon', 'social-preview',
    'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
    'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
    'leader-project-owner', 'header-feature-image'
  ]::text[]));

alter table public.site_media_slots
  drop constraint if exists site_media_slots_media_key_check;
alter table public.site_media_slots
  add constraint site_media_slots_media_key_check
  check (media_key = any (array[
    'site-mark', 'site-favicon', 'social-preview',
    'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
    'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
    'leader-project-owner', 'header-feature-image'
  ]::text[]));

insert into public.site_media_slots (media_key, title, usage_description)
values (
  'header-feature-image',
  'صورة مربعة أسفل علم مصر',
  'صورة اختيارية في مربع أسفل العلم داخل الترويسة؛ قابلة للاستبدال من مكتبة صور الموقع.'
)
on conflict (media_key) do nothing;

drop policy if exists site_media_objects_admin_insert on storage.objects;
create policy site_media_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and public.is_site_media_admin()
    and name ~ '^media/(site-mark|site-favicon|social-preview|leader-sisi|leader-minister|leader-governor|leader-director|leader-north-admin|leader-library-supervisor|leader-first-supervisor|leader-project-owner|header-feature-image)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
  );
