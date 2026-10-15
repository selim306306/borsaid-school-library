CREATE FUNCTION public.import_titles_with_holdings(p_library_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_item jsonb;
  v_general_number text;
  v_title text;
  v_author text;
  v_classification text;
  v_isbn text;
  v_series_name text;
  v_branch_id uuid;
  v_inventory_tag text;
  v_cabinet_code text;
  v_shelf_code text;
  v_public_shelf_label text;
  v_is_published boolean;
  v_title_id uuid;
  v_existing public.catalog_titles%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.library_memberships m
    WHERE m.library_id = p_library_id
      AND m.user_id = v_actor
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin', 'librarian')
  ) THEN
    RAISE EXCEPTION 'not authorized to import catalog records' USING errcode = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array' USING errcode = '22023';
  END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'an import must contain between 1 and 5000 copies' USING errcode = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'each import row must be an object' USING errcode = '22023';
    END IF;

    v_general_number := nullif(btrim(v_item ->> 'general_number'), '');
    v_title := nullif(btrim(v_item ->> 'title'), '');
    v_author := nullif(btrim(v_item ->> 'author'), '');
    v_classification := nullif(btrim(v_item ->> 'classification'), '');
    v_isbn := nullif(btrim(v_item ->> 'isbn'), '');
    v_series_name := nullif(btrim(v_item ->> 'series_name'), '');
    v_inventory_tag := nullif(btrim(v_item ->> 'inventory_tag'), '');
    v_cabinet_code := nullif(btrim(v_item ->> 'cabinet_code'), '');
    v_shelf_code := nullif(btrim(v_item ->> 'shelf_code'), '');
    v_public_shelf_label := nullif(btrim(v_item ->> 'public_shelf_label'), '');

    BEGIN
      v_branch_id := nullif(btrim(v_item ->> 'branch_id'), '')::uuid;
      v_is_published := coalesce((v_item ->> 'is_published')::boolean, false);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'branch id or publication choice is invalid' USING errcode = '22023';
    END;

    IF v_general_number IS NULL OR length(v_general_number) > 80
       OR v_title IS NULL OR length(v_title) > 240
       OR length(coalesce(v_author, '')) > 180
       OR length(coalesce(v_classification, '')) > 120
       OR (v_classification IS NOT NULL AND v_classification !~ '^[0-9]{3}(\.[0-9]{1,8})?$')
       OR length(coalesce(v_isbn, '')) > 20
       OR (v_isbn IS NOT NULL AND v_isbn !~ '^([0-9]{13}|[0-9]{9}[0-9X])$')
       OR length(coalesce(v_series_name, '')) > 240
       OR length(coalesce(v_inventory_tag, '')) > 100
       OR length(coalesce(v_cabinet_code, '')) > 80
       OR length(coalesce(v_shelf_code, '')) > 80
       OR length(coalesce(v_public_shelf_label, '')) > 120
       OR v_branch_id IS NULL THEN
      RAISE EXCEPTION 'an import row contains invalid or oversized values' USING errcode = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = v_branch_id AND b.library_id = p_library_id
    ) THEN
      RAISE EXCEPTION 'an import branch does not belong to the selected library' USING errcode = '23503';
    END IF;

    SELECT t.* INTO v_existing
    FROM public.catalog_titles t
    WHERE t.library_id = p_library_id AND t.general_number = v_general_number;

    IF FOUND THEN
      v_title_id := v_existing.id;
      IF lower(btrim(v_existing.title)) <> lower(v_title)
         OR (v_author IS NOT NULL AND coalesce(v_existing.author, '') <> v_author)
         OR (v_classification IS NOT NULL AND coalesce(v_existing.classification, '') <> v_classification)
         OR (v_isbn IS NOT NULL AND coalesce(v_existing.isbn, '') <> v_isbn)
         OR (v_series_name IS NOT NULL AND coalesce(v_existing.series_name, '') <> v_series_name) THEN
        RAISE EXCEPTION 'an existing general number has conflicting bibliographic data' USING errcode = '23505';
      END IF;
    ELSE
      INSERT INTO public.catalog_titles(
        library_id, general_number, title, author, classification, isbn, series_name,
        subjects, description_public, language, is_published
      ) VALUES (
        p_library_id, v_general_number, v_title, v_author, v_classification, v_isbn,
        v_series_name, '{}', NULL, 'ar', v_is_published
      ) RETURNING id INTO v_title_id;
    END IF;

    INSERT INTO public.holdings(
      library_id, branch_id, title_id, inventory_tag, cabinet_code, shelf_code,
      public_shelf_label, status
    ) VALUES (
      p_library_id, v_branch_id, v_title_id, v_inventory_tag, v_cabinet_code,
      v_shelf_code, v_public_shelf_label, 'available'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_titles_with_holdings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_titles_with_holdings(uuid, jsonb) TO authenticated;
