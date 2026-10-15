-- Private, version-preserving site media for the borsaid-school-library project.
-- School-specific logos stay in school-branding/library_profiles and are not mixed here.

create or replace function public.is_site_media_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.library_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
      and membership.library_id in (
        'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4'::uuid,
        'c5d10456-1c6e-4bd1-8275-d14e354ac285'::uuid
      )
  );
$function$;

revoke all on function public.is_site_media_admin() from public;
grant execute on function public.is_site_media_admin() to authenticated;

create table public.site_media_assets (
  id uuid primary key default gen_random_uuid(),
  media_key text not null check (media_key in (
    'site-mark', 'site-favicon', 'social-preview',
    'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
    'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
    'leader-project-owner'
  )),
  storage_path text not null unique,
  original_file_name text not null check (char_length(btrim(original_file_name)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 300),
  description text not null default '' check (char_length(description) <= 500),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, media_key),
  check (
    storage_path ~ (
      '^media/' || media_key || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
    )
  ),
  check (
    (mime_type = 'image/png' and storage_path ~ '[.]png$') or
    (mime_type = 'image/jpeg' and storage_path ~ '[.]jpg$') or
    (mime_type = 'image/webp' and storage_path ~ '[.]webp$')
  )
);

create table public.site_media_slots (
  media_key text primary key check (media_key in (
    'site-mark', 'site-favicon', 'social-preview',
    'leader-sisi', 'leader-minister', 'leader-governor', 'leader-director',
    'leader-north-admin', 'leader-library-supervisor', 'leader-first-supervisor',
    'leader-project-owner'
  )),
  title text not null check (char_length(title) between 1 and 160),
  usage_description text not null check (char_length(usage_description) between 1 and 500),
  current_asset_id uuid,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint site_media_slots_asset_key_fkey
    foreign key (current_asset_id, media_key)
    references public.site_media_assets(id, media_key)
    on update restrict on delete restrict
);

alter table public.site_media_assets enable row level security;
alter table public.site_media_slots enable row level security;

revoke all on public.site_media_assets, public.site_media_slots from public, anon, authenticated;
grant select on public.site_media_assets to anon, authenticated;
grant insert on public.site_media_assets to authenticated;
grant update (original_file_name, alt_text, description) on public.site_media_assets to authenticated;
grant select on public.site_media_slots to anon, authenticated;
grant update (current_asset_id, updated_at) on public.site_media_slots to authenticated;

drop policy if exists site_media_slots_public_read on public.site_media_slots;
create policy site_media_slots_public_read
  on public.site_media_slots for select to anon, authenticated
  using (is_published = true);

drop policy if exists site_media_slots_admin_read on public.site_media_slots;
create policy site_media_slots_admin_read
  on public.site_media_slots for select to authenticated
  using (public.is_site_media_admin());

drop policy if exists site_media_slots_admin_update on public.site_media_slots;
create policy site_media_slots_admin_update
  on public.site_media_slots for update to authenticated
  using (public.is_site_media_admin())
  with check (public.is_site_media_admin() and is_published = true);

drop policy if exists site_media_assets_public_read on public.site_media_assets;
create policy site_media_assets_public_read
  on public.site_media_assets for select to anon, authenticated
  using (
    exists (
      select 1
      from public.site_media_slots as slot
      where slot.current_asset_id = site_media_assets.id
        and slot.media_key = site_media_assets.media_key
        and slot.is_published = true
    )
  );

drop policy if exists site_media_assets_admin_read on public.site_media_assets;
create policy site_media_assets_admin_read
  on public.site_media_assets for select to authenticated
  using (public.is_site_media_admin());

drop policy if exists site_media_assets_admin_insert on public.site_media_assets;
create policy site_media_assets_admin_insert
  on public.site_media_assets for insert to authenticated
  with check (
    public.is_site_media_admin()
    and uploaded_by = (select auth.uid())
    and exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'site-media'
        and object.name = site_media_assets.storage_path
        and object.owner_id = (select auth.uid())::text
    )
  );

drop policy if exists site_media_assets_admin_update on public.site_media_assets;
create policy site_media_assets_admin_update
  on public.site_media_assets for update to authenticated
  using (public.is_site_media_admin())
  with check (public.is_site_media_admin());

insert into public.site_media_slots (media_key, title, usage_description)
values
  ('site-mark', 'شعار بوابة مدارس بورسعيد', 'أيقونة الرأس والتذييل ونوافذ دخول الموظفين.'),
  ('site-favicon', 'أيقونة المتصفح', 'الأيقونة الصغيرة بجوار عنوان الموقع في المتصفح.'),
  ('social-preview', 'صورة المشاركة والتعريف', 'صورة معاينة رابط الموقع عند مشاركته.'),
  ('leader-sisi', 'السيد الرئيس عبد الفتاح السيسي', 'صورة تعريفية في قسم قيادات التعليم والمكتبات.'),
  ('leader-minister', 'السيد محمد عبد اللطيف', 'وزير التربية والتعليم والتعليم الفني.'),
  ('leader-governor', 'اللواء إبراهيم أبو ليمون', 'محافظ بورسعيد؛ منفصل عن صورة مدير المدرسة.'),
  ('leader-director', 'الأستاذ محمود بدوي', 'مدير مديرية التربية والتعليم ببورسعيد.'),
  ('leader-north-admin', 'الدكتورة أميرة عبد اللطيف', 'مديرة إدارة شمال التعليمية ببورسعيد.'),
  ('leader-library-supervisor', 'الأستاذ حسن محمد حسن', 'الموجه العام للمكتبات ببورسعيد.'),
  ('leader-first-supervisor', 'الأستاذ محمد سمير أبو عميرة', 'موجه أول المكتبات ببورسعيد.'),
  ('leader-project-owner', 'محمد حامد', 'أخصائي أول مكتبات ومدير ومصمم المشروع.')
on conflict (media_key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_media_objects_published_read on storage.objects;
create policy site_media_objects_published_read
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'site-media'
    and exists (
      select 1
      from public.site_media_assets as asset
      join public.site_media_slots as slot
        on slot.current_asset_id = asset.id and slot.media_key = asset.media_key
      where asset.storage_path = storage.objects.name
        and slot.is_published = true
    )
  );

drop policy if exists site_media_objects_admin_read on storage.objects;
create policy site_media_objects_admin_read
  on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.is_site_media_admin());

drop policy if exists site_media_objects_admin_insert on storage.objects;
create policy site_media_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and public.is_site_media_admin()
    and name ~ '^media/(site-mark|site-favicon|social-preview|leader-sisi|leader-minister|leader-governor|leader-director|leader-north-admin|leader-library-supervisor|leader-first-supervisor|leader-project-owner)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
  );

-- No update/delete policies are granted for site-media storage objects.
-- Old and reset images remain in the private owner-visible archive; no cleanup is automatic.
