-- Go-live audit (3 Nov), database speed (Supabase advisor):
-- 1. Row-level policies called auth.uid() / auth.role() / auth.jwt() once
--    per row. Wrapped as (SELECT auth.uid()) Postgres works it out once per
--    query instead. Same rule, same result - only the expression is
--    rewritten, through ALTER POLICY, for every public policy that still
--    has a bare call.
-- 2. Foreign keys without an index: joins and deletes on the parent table
--    scan the whole child table. An index on the key's columns for each one
--    that has none.

DO $$
DECLARE
  r record;
  v_bare constant text := '(?<!SELECT )auth\.(uid|role|jwt)\(\)';
  v_wrap constant text := '(SELECT auth.\1())';
  v_sql text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ v_bare OR coalesce(with_check, '') ~ v_bare)
  LOOP
    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', regexp_replace(r.qual, v_bare, v_wrap, 'g'));
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', regexp_replace(r.with_check, v_bare, v_wrap, 'g'));
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, cl.relname,
           string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) AS cols,
           string_agg(a.attname, '_' ORDER BY k.ord) AS col_names
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] = c.conkey
      )
    GROUP BY c.oid, c.conrelid, cl.relname
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)',
                   left(r.relname || '_' || r.col_names, 58) || '_fidx', r.tbl, r.cols);
  END LOOP;
END;
$$;
