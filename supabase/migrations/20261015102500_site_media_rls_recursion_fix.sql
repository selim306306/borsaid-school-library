-- Keep upload ownership validation out of a recursive RLS subquery.
-- The BEFORE INSERT trigger runs as its protected owner and checks the Storage object;
-- callers still need an authenticated user session, platform-admin role, and their own uploaded_by.

create or replace function public.validate_site_media_upload_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'site-media'
      and object.name = new.storage_path
      and object.owner_id = (select auth.uid())::text
  ) then
    raise exception using
      errcode = '42501',
      message = 'The uploaded site-media object does not belong to the current user.';
  end if;
  return new;
end;
$function$;

revoke all on function public.validate_site_media_upload_owner() from public, anon, authenticated;

drop trigger if exists site_media_asset_owner_upload_check on public.site_media_assets;
create trigger site_media_asset_owner_upload_check
  before insert on public.site_media_assets
  for each row execute function public.validate_site_media_upload_owner();

drop policy if exists site_media_assets_admin_insert on public.site_media_assets;
create policy site_media_assets_admin_insert
  on public.site_media_assets for insert to authenticated
  with check (
    public.is_site_media_admin()
    and uploaded_by = (select auth.uid())
  );
