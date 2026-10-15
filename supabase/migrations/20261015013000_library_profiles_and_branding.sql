-- Additive school profiles and branding for the borsaid-school-library project only.
-- Existing library rows remain unchanged, unpublished, and without a profile until an owner enters data.

create table if not exists public.library_profiles (
  library_id uuid primary key references public.libraries(id) on delete cascade,
  school_name text not null check (length(btrim(school_name)) between 2 and 160),
  educational_administration text check (educational_administration is null or length(educational_administration) <= 160),
  librarian_name text check (librarian_name is null or length(librarian_name) <= 160),
  school_logo_path text check (school_logo_path is null or length(school_logo_path) <= 500),
  governorate_logo_path text check (governorate_logo_path is null or length(governorate_logo_path) <= 500),
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.library_profiles enable row level security;
revoke all on public.library_profiles from public;
grant select on public.library_profiles to anon;
grant select, insert, update on public.library_profiles to authenticated;

drop policy if exists library_profiles_owner_read on public.library_profiles;
create policy library_profiles_owner_read
  on public.library_profiles for select to authenticated
  using (public.has_library_role(library_id, array['owner']::text[]));

drop policy if exists library_profiles_public_read on public.library_profiles;
create policy library_profiles_public_read
  on public.library_profiles for select to anon, authenticated
  using (
    is_public = true
    and exists (
      select 1 from public.libraries l
      where l.id = library_profiles.library_id and l.is_published = true
    )
  );

drop policy if exists library_profiles_owner_insert on public.library_profiles;
create policy library_profiles_owner_insert
  on public.library_profiles for insert to authenticated
  with check (public.has_library_role(library_id, array['owner']::text[]));

drop policy if exists library_profiles_owner_update on public.library_profiles;
create policy library_profiles_owner_update
  on public.library_profiles for update to authenticated
  using (public.has_library_role(library_id, array['owner']::text[]))
  with check (public.has_library_role(library_id, array['owner']::text[]));

-- This bucket contains only school/governorate logo images. Public reads are intentional;
-- write and replacement are limited to an active owner of the library in the object path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-branding', 'school-branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists school_branding_public_read on storage.objects;
create policy school_branding_public_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'school-branding');

drop policy if exists school_branding_owner_insert on storage.objects;
create policy school_branding_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-branding'
    and case
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(school-logo|governorate-logo)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_library_role(split_part(name, '/', 1)::uuid, array['owner']::text[])
      else false
    end
  );

drop policy if exists school_branding_owner_update on storage.objects;
create policy school_branding_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'school-branding'
    and case
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(school-logo|governorate-logo)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_library_role(split_part(name, '/', 1)::uuid, array['owner']::text[])
      else false
    end
  )
  with check (
    bucket_id = 'school-branding'
    and case
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(school-logo|governorate-logo)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_library_role(split_part(name, '/', 1)::uuid, array['owner']::text[])
      else false
    end
  );

drop policy if exists school_branding_owner_delete on storage.objects;
create policy school_branding_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-branding'
    and case
      when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(school-logo|governorate-logo)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_library_role(split_part(name, '/', 1)::uuid, array['owner']::text[])
      else false
    end
  );

create or replace function public.create_owned_school(
  p_school_name text,
  p_educational_administration text default null,
  p_librarian_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_library_id uuid;
  clean_school_name text := btrim(coalesce(p_school_name, ''));
  clean_administration text := nullif(btrim(coalesce(p_educational_administration, '')), '');
  clean_librarian text := nullif(btrim(coalesce(p_librarian_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.library_memberships m
    where m.user_id = auth.uid() and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'active_library_owner_required' using errcode = '42501';
  end if;
  if length(clean_school_name) < 2 or length(clean_school_name) > 160 then
    raise exception 'school_name_must_be_2_to_160_characters' using errcode = '22023';
  end if;
  if clean_administration is not null and length(clean_administration) > 160 then
    raise exception 'administration_name_too_long' using errcode = '22023';
  end if;
  if clean_librarian is not null and length(clean_librarian) > 160 then
    raise exception 'librarian_name_too_long' using errcode = '22023';
  end if;

  insert into public.libraries (name, governorate, city, is_published, interlibrary_enabled)
  values (clean_school_name, 'بورسعيد', 'بورسعيد', false, false)
  returning id into new_library_id;

  insert into public.library_memberships (library_id, user_id, role, status)
  values (new_library_id, auth.uid(), 'owner', 'active');

  insert into public.library_profiles (library_id, school_name, educational_administration, librarian_name, is_public)
  values (new_library_id, clean_school_name, clean_administration, clean_librarian, false);

  return new_library_id;
end;
$function$;

revoke all on function public.create_owned_school(text, text, text) from public, anon;
grant execute on function public.create_owned_school(text, text, text) to authenticated;
