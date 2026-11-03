-- Go-live audit (3 Nov), database speed, after 20261103174500: the role
-- checks in row policies - has_role(<me>, 'admin') (81 on the test
-- database) and can_operate_warehouse(<me>) (11) - still ran once per row,
-- for every shopper too (the admin policies apply to everyone and are
-- OR-ed with the shopper's own). They read nothing from the row, so as
-- (SELECT has_role(...)) Postgres works them out once per query. Same
-- rules; checks that use a row's column (is_vendor_member(<me>, vendor_id))
-- are left as they are.

DO $$
DECLARE
  r record;
  v_call constant text :=
    '(?<!SELECT )(has_role\(\( SELECT auth\.uid\(\) AS uid\), ''[a-z_]+''::app_role\)|can_operate_warehouse\(\( SELECT auth\.uid\(\) AS uid\)\))';
  v_sql text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ v_call OR coalesce(with_check, '') ~ v_call)
  LOOP
    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', regexp_replace(r.qual, v_call, '( SELECT \1)', 'g'));
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', regexp_replace(r.with_check, v_call, '( SELECT \1)', 'g'));
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;
