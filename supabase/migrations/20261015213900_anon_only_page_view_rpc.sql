-- The public client is anonymous; authenticated staff only need SELECT through RLS.
revoke execute on function public.record_public_page_view(text) from authenticated;
