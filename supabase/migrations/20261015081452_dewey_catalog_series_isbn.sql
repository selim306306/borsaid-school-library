ALTER TABLE public.catalog_titles
  ADD COLUMN IF NOT EXISTS isbn text,
  ADD COLUMN IF NOT EXISTS series_name text;

ALTER TABLE public.catalog_titles
  ADD CONSTRAINT catalog_titles_isbn_length_check
    CHECK (isbn IS NULL OR char_length(isbn) <= 20),
  ADD CONSTRAINT catalog_titles_series_name_length_check
    CHECK (series_name IS NULL OR char_length(series_name) <= 240);

CREATE INDEX IF NOT EXISTS catalog_titles_isbn_idx
  ON public.catalog_titles (isbn)
  WHERE isbn IS NOT NULL;

COMMENT ON COLUMN public.catalog_titles.isbn IS 'ISBN-10 or ISBN-13 identifier; separate from the library general number.';
COMMENT ON COLUMN public.catalog_titles.series_name IS 'Optional book series title.';

CREATE OR REPLACE VIEW public.public_catalog WITH (security_invoker = true) AS
SELECT
  t.id AS title_id,
  t.library_id,
  t.general_number,
  t.title,
  t.author,
  t.classification,
  t.subjects,
  t.description_public,
  t.language,
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.governorate,
  count(*) FILTER (WHERE h.status = 'available'::text) AS available_copies,
  count(*) AS visible_copies,
  min(h.public_shelf_label) FILTER (WHERE h.status = 'available'::text) AS public_shelf_label,
  t.series_name
FROM public.catalog_titles t
JOIN public.libraries l ON l.id = t.library_id AND l.is_published = true
JOIN public.holdings h ON h.library_id = t.library_id AND h.title_id = t.id
  AND h.status = ANY (ARRAY['available'::text, 'on_loan'::text])
JOIN public.branches b ON b.library_id = h.library_id AND b.id = h.branch_id AND b.is_published = true
WHERE t.is_published = true
GROUP BY t.id, t.library_id, t.general_number, t.title, t.author, t.classification,
  t.subjects, t.description_public, t.language, b.id, b.name, b.city, b.governorate,
  t.series_name;

CREATE FUNCTION public.create_title_with_holding_v2(
  p_library_id uuid,
  p_branch_id uuid,
  p_general_number text,
  p_title text,
  p_author text DEFAULT NULL,
  p_classification text DEFAULT NULL,
  p_isbn text DEFAULT NULL,
  p_series_name text DEFAULT NULL,
  p_inventory_tag text DEFAULT NULL,
  p_cabinet_code text DEFAULT NULL,
  p_shelf_code text DEFAULT NULL,
  p_public_shelf_label text DEFAULT NULL,
  p_is_published boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_title_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.library_id = p_library_id AND m.user_id = v_actor AND m.status = 'active'
      AND m.role IN ('owner','admin','librarian')
  ) THEN
    RAISE EXCEPTION 'not authorized to create catalog records' USING errcode = '42501';
  END IF;
  IF p_general_number IS NULL OR length(trim(p_general_number)) NOT BETWEEN 1 AND 80
     OR p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 240
     OR length(coalesce(p_author,'')) > 180
     OR length(coalesce(p_classification,'')) > 120
     OR length(coalesce(p_isbn,'')) > 20
     OR (nullif(trim(p_isbn), '') IS NOT NULL AND trim(p_isbn) !~ '^([0-9]{13}|[0-9]{9}[0-9X])$')
     OR length(coalesce(p_series_name,'')) > 240
     OR length(coalesce(p_inventory_tag,'')) > 100
     OR length(coalesce(p_cabinet_code,'')) > 80
     OR length(coalesce(p_shelf_code,'')) > 80
     OR length(coalesce(p_public_shelf_label,'')) > 120 THEN
    RAISE EXCEPTION 'catalog fields are invalid or too long' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.library_id = p_library_id
  ) THEN
    RAISE EXCEPTION 'branch does not belong to this library' USING errcode = '23503';
  END IF;
  INSERT INTO public.catalog_titles(
    library_id, general_number, title, author, classification, isbn, series_name,
    subjects, description_public, language, is_published
  ) VALUES (
    p_library_id, trim(p_general_number), trim(p_title), nullif(trim(p_author), ''),
    nullif(trim(p_classification), ''), nullif(trim(p_isbn), ''),
    nullif(trim(p_series_name), ''), '{}', NULL, 'ar', coalesce(p_is_published, false)
  ) RETURNING id INTO v_title_id;
  INSERT INTO public.holdings(
    library_id, branch_id, title_id, inventory_tag, cabinet_code, shelf_code,
    public_shelf_label, status
  ) VALUES (
    p_library_id, p_branch_id, v_title_id, nullif(trim(p_inventory_tag), ''),
    nullif(trim(p_cabinet_code), ''), nullif(trim(p_shelf_code), ''),
    nullif(trim(p_public_shelf_label), ''), 'available'
  );
  RETURN v_title_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_title_with_holding_v2(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_title_with_holding_v2(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean
) TO authenticated;

CREATE FUNCTION public.search_public_catalog_v2(
  p_query text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_available_only boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  title_id uuid,
  library_id uuid,
  general_number text,
  title text,
  author text,
  classification text,
  subjects text[],
  description_public text,
  language text,
  branch_id uuid,
  branch_name text,
  city text,
  governorate text,
  available_copies bigint,
  visible_copies bigint,
  public_shelf_label text,
  series_name text
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT c.title_id, c.library_id, c.general_number, c.title, c.author, c.classification,
    c.subjects, c.description_public, c.language, c.branch_id, c.branch_name, c.city,
    c.governorate, c.available_copies, c.visible_copies, c.public_shelf_label, c.series_name
  FROM public.public_catalog c
  WHERE (nullif(trim(coalesce(p_query, '')), '') IS NULL
      OR strpos(lower(concat_ws(' ', c.general_number, c.title, c.author, c.classification,
        array_to_string(c.subjects, ' '), c.series_name, c.branch_name, c.city)),
        lower(trim(p_query))) > 0)
    AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
    AND (NOT p_available_only OR c.available_copies > 0)
  ORDER BY c.title ASC, c.branch_name ASC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

REVOKE ALL ON FUNCTION public.search_public_catalog_v2(text, uuid, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_catalog_v2(text, uuid, boolean, integer, integer)
  TO anon, authenticated, service_role;
