-- Keep the school name in the homepage brand independently from directory publication.
-- Existing schools keep their current homepage-name visibility by default.
ALTER TABLE public.library_profiles
  ADD COLUMN IF NOT EXISTS show_school_name_on_homepage boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.library_profiles.show_school_name_on_homepage IS
  'Controls only whether this public school name is printed beside the Egypt mark in the homepage brand. It does not change directory publication, the school logo, the Egypt mark, or any school data.';
