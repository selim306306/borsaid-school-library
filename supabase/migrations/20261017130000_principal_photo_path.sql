-- Add the nullable principal photo path without changing existing profile or storage policies.
-- Owners may use only library_id/principal-photo-UUID paths in school-branding.
alter table public.library_profiles
  add column if not exists principal_photo_path text
  check (
    principal_photo_path is null
    or principal_photo_path ~ (
      '^' || library_id::text || '/principal-photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

comment on column public.library_profiles.principal_photo_path is
  'Optional school principal image object path: library_id/principal-photo-UUID';

-- Existing migrations grant table-level read/write access. These explicit column grants
-- document the intended visibility/editability of this newly added column as well.
grant select (principal_photo_path) on public.library_profiles to anon, authenticated;
grant update (principal_photo_path) on public.library_profiles to authenticated;

-- Keep the existing school-branding policies unchanged; this policy is only for the
-- principal-photo-UUID object path and still requires an active owner of that library.
create policy school_branding_principal_photo_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-branding'
    and case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/principal-photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_library_role(split_part(name, '/', 1)::uuid, array['owner']::text[])
      else false end
  );

create policy school_branding_principal_photo_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-branding'
    and case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/principal-photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_library_role(split_part(name, '/', 1)::uuid, array['owner']::text[])
      else false end
  );
