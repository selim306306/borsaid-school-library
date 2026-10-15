-- The site-admin membership check is not needed by anonymous visitors.
revoke all on function public.is_site_media_admin() from PUBLIC, anon;
grant execute on function public.is_site_media_admin() to authenticated;
