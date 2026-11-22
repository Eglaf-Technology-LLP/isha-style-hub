-- Shop photos and videos on R2 that nothing links to any more are cleared
-- out (client, 23 Nov 2026): the media-delete and media-cleanup functions
-- (see supabase/functions/_shared/r2.ts, "Clearing out files nothing links
-- to"). These two functions answer "does any row still mention this file?".
--
-- A file is known by its upload's id, in "<folder>/<id>" (e.g.
-- products/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.sw.jpg). Every text, json
-- and array column of every public table is searched, not a fixed list, so
-- a column added later can't be missed and a file stays while anything at
-- all still mentions it.

CREATE OR REPLACE FUNCTION public.media_text_columns()
RETURNS TABLE (table_name text, column_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.table_name::text, c.column_name::text
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND c.data_type IN ('text', 'character varying', 'character', 'json', 'jsonb', 'ARRAY', 'USER-DEFINED')
  ORDER BY 1, 2;
$$;

-- Every upload id mentioned anywhere, as one array: a set-returning
-- function would be cut at PostgREST's row limit, and a cut list would make
-- files in use look unused.
CREATE OR REPLACE FUNCTION public.media_file_ids_in_use()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_found text[];
  v_ids text[] := '{}';
BEGIN
  FOR v_col IN SELECT * FROM public.media_text_columns() LOOP
    EXECUTE format(
      'SELECT coalesce(array_agg(DISTINCT lower(m[1])), ''{}'') FROM public.%I t, regexp_matches(t.%I::text, %L, ''g'') AS m',
      v_col.table_name,
      v_col.column_name,
      '(?:products|hero|categories|vendor-uploads)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
    ) INTO v_found;
    v_ids := v_ids || v_found;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT unnest(v_ids));
END;
$$;

-- One file, for media-delete: any mention of the id at all counts.
CREATE OR REPLACE FUNCTION public.media_file_id_in_use(p_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_found boolean;
BEGIN
  IF p_id IS NULL OR p_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Not an upload id: %', p_id;
  END IF;
  FOR v_col IN SELECT * FROM public.media_text_columns() LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I t WHERE t.%I::text ILIKE %L)',
      v_col.table_name, v_col.column_name, '%' || p_id || '%')
    INTO v_found;
    IF v_found THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- Read every table, so for the edge functions (service role) only.
REVOKE ALL ON FUNCTION public.media_text_columns() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_file_ids_in_use() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_file_id_in_use(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_text_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.media_file_ids_in_use() TO service_role;
GRANT EXECUTE ON FUNCTION public.media_file_id_in_use(text) TO service_role;
