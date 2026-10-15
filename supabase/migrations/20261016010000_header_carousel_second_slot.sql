-- Add a second owner-managed banner image while preserving the existing first slot.
-- No public school records, books, staff permissions, or borrower data are changed.

alter table public.site_media_assets
  drop constraint if exists site_media_assets_media_key_check;
alter table public.site_media_assets
  add constraint site_media_assets_media_key_check
  check (media_key = any (array[
    'site-mark', 'site-favicon', 'social-preview',
    'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
    'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
    'leader-project-owner', 'header-feature-image', 'header-feature-image-2'
  ]::text[]));

alter table public.site_media_slots
  drop constraint if exists site_media_slots_media_key_check;
alter table public.site_media_slots
  add constraint site_media_slots_media_key_check
  check (media_key = any (array[
    'site-mark', 'site-favicon', 'social-preview',
    'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
    'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
    'leader-project-owner', 'header-feature-image', 'header-feature-image-2'
  ]::text[]));

insert into public.site_media_slots (media_key, title, usage_description)
values (
  'header-feature-image-2',
  'الصورة الثانية في البنر',
  'الشريحة الثانية في البنر الدوّار؛ يمكن استبدال الصورة من مكتبة وسائط الموقع.'
)
on conflict (media_key) do nothing;

drop policy if exists site_media_objects_admin_insert on storage.objects;
create policy site_media_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and public.is_site_media_admin()
    and name ~ '^media/(site-mark|site-favicon|social-preview|leader-sisi|leader-minister|leader-governor|leader-director|leader-north-admin|leader-library-supervisor|leader-first-supervisor|leader-project-owner|header-feature-image|header-feature-image-2)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
  );
