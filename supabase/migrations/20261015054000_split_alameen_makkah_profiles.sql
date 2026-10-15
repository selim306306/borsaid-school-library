-- Split the existing Al-Amin library row from the Makkah school profile.
-- Preserve the current Makkah profile and its two public logo paths; create a separate,
-- unpublished library record for Makkah and an Al-Amin profile with no assumed logos,
-- principal, or deputies. Both school profiles remain individually public; catalogs stay unpublished.
do $$
declare
  alameen_library_id uuid;
  makkah_library_id uuid;
  source_governorate text;
  source_city text;
  current_profile_name text;
begin
  select l.id, l.governorate, l.city, p.school_name
    into alameen_library_id, source_governorate, source_city, current_profile_name
  from public.libraries l
  join public.library_profiles p on p.library_id = l.id
  where l.name = 'مكتبة مدرسة الأمين الابتدائية'
  order by l.created_at
  limit 1;

  if alameen_library_id is null then
    raise exception 'Expected the existing Al-Amin library profile was not found; no records were changed.';
  end if;

  select l.id into makkah_library_id
  from public.libraries l
  join public.library_profiles p on p.library_id = l.id
  where l.name = 'مكتبة مدرسة مكة المكرمة'
    and p.school_name = 'مكة المكرمة'
  order by l.created_at
  limit 1;

  if makkah_library_id is null then
    if current_profile_name is distinct from 'مكة المكرمة' then
      raise exception 'The current Al-Amin profile is not Makkah; no records were changed.';
    end if;

    insert into public.libraries (name, governorate, city, is_published, interlibrary_enabled)
    values ('مكتبة مدرسة مكة المكرمة', source_governorate, source_city, false, false)
    returning id into makkah_library_id;

    insert into public.library_memberships (library_id, user_id, role, status)
    select makkah_library_id, m.user_id, 'owner', 'active'
    from public.library_memberships m
    where m.library_id = alameen_library_id
      and m.role = 'owner'
      and m.status = 'active'
    order by m.created_at
    limit 50;

    if not exists (
      select 1 from public.library_memberships m
      where m.library_id = makkah_library_id and m.role = 'owner' and m.status = 'active'
      limit 1
    ) then
      raise exception 'No active owner membership could be copied; the transaction was rolled back.';
    end if;

    update public.library_profiles
    set library_id = makkah_library_id,
        general_supervisor_name = 'حسن محمد حسن',
        first_supervisor_name = 'محمد سمير أبو عميرة',
        is_public = true,
        updated_at = now()
    where library_id = alameen_library_id;

    if not found then
      raise exception 'Could not move the Makkah profile; the transaction was rolled back.';
    end if;
  else
    insert into public.library_memberships (library_id, user_id, role, status)
    select makkah_library_id, m.user_id, 'owner', 'active'
    from public.library_memberships m
    where m.library_id = alameen_library_id
      and m.role = 'owner'
      and m.status = 'active'
      and not exists (
        select 1 from public.library_memberships existing
        where existing.library_id = makkah_library_id
          and existing.user_id = m.user_id
          and existing.role = 'owner'
        limit 1
      )
    order by m.created_at
    limit 50;

    update public.library_profiles
    set general_supervisor_name = 'حسن محمد حسن',
        first_supervisor_name = 'محمد سمير أبو عميرة',
        is_public = true,
        updated_at = now()
    where library_id = makkah_library_id;
  end if;

  insert into public.library_profiles (
    library_id, school_name, general_supervisor_name, first_supervisor_name, is_public, updated_at
  ) values (
    alameen_library_id, 'مدرسة الأمين الابتدائية', 'حسن محمد حسن', 'محمد سمير أبو عميرة', true, now()
  )
  on conflict (library_id) do update
  set school_name = excluded.school_name,
      school_logo_path = null,
      governorate_logo_path = null,
      principal_name = null,
      deputy_names = null,
      general_supervisor_name = excluded.general_supervisor_name,
      first_supervisor_name = excluded.first_supervisor_name,
      is_public = true,
      updated_at = now();
end;
$$;
