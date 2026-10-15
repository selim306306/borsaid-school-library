-- Add public leadership fields to each school profile without changing existing records.
-- Public profile visibility is controlled by library_profiles.is_public; catalog publication stays separate.
alter table public.library_profiles
  add column if not exists principal_name text check (principal_name is null or char_length(principal_name) <= 160),
  add column if not exists deputy_names text check (deputy_names is null or char_length(deputy_names) <= 1200),
  add column if not exists general_supervisor_name text check (general_supervisor_name is null or char_length(general_supervisor_name) <= 160),
  add column if not exists first_supervisor_name text check (first_supervisor_name is null or char_length(first_supervisor_name) <= 160);
