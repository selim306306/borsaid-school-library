-- Allow an explicitly public school profile to appear in the directory independently
-- of publishing the library catalog or its branches. The is_public flag remains the gate.
drop policy if exists library_profiles_public_read on public.library_profiles;
create policy library_profiles_public_read
  on public.library_profiles for select to anon, authenticated
  using (is_public = true);
