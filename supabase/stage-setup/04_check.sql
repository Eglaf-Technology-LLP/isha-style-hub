-- =====================================================================
-- AllBoutiqs STAGE database - STEP 4: check everything is in place
--
-- Read-only: it changes nothing, so it is safe to run any time.
-- How to run: Stage project -> SQL Editor -> New query -> paste this whole
-- file -> Run. Right after setup every row should say OK.
--
-- It compares the structure of this database (tables, columns, rules,
-- functions, triggers, permissions, storage buckets, scheduled jobs,
-- recorded migrations) with a fingerprint of the LIVE database
-- (whycxtnjhdbewgyugfax, taken 2026-11-23, 4879 objects). Settings and
-- other data are not compared. It also checks the admin account and the
-- Vault secrets. Line endings are ignored, so a copy-paste that turned
-- CRLF into LF still matches.
-- =====================================================================

WITH
app_rel AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.relowner
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','v','m','S','p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
),
app_fn AS (
  SELECT p.oid, p.proname, p.proacl, p.proowner, p.prokind
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname <> 'rls_auto_enable'  -- Supabase's optional "auto-enable RLS" helper, not part of the app
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
),
raw_items AS (
  SELECT 'tables' AS cat, relname || ' kind=' || relkind::text || ' rls=' || relrowsecurity::text || ' force=' || relforcerowsecurity::text AS item FROM app_rel
  UNION ALL
  SELECT 'columns', c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
         || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END
         || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
         || CASE WHEN a.attgenerated <> '' THEN ' generated' ELSE '' END
  FROM app_rel c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE c.relkind IN ('r','p','v','m')
  UNION ALL
  SELECT 'constraints', conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid <> 0
    AND contype <> 'n'  -- PostgreSQL 18+ lists NOT NULL here too; "columns" already covers it
  UNION ALL
  SELECT 'indexes', indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 'security policies (RLS)', schemaname || '.' || tablename || ' ' || policyname || ' ' || permissive || ' ' || cmd || ' ' || roles::text
         || ' using(' || coalesce(qual, '') || ') check(' || coalesce(with_check, '') || ')'
  FROM pg_policies WHERE schemaname IN ('public', 'storage')
  UNION ALL
  SELECT 'functions', proname || '(' || pg_get_function_identity_arguments(oid) || ') md5=' || md5(replace(pg_get_functiondef(oid), E'\r', ''))
  FROM app_fn WHERE prokind IN ('f','p')
  UNION ALL
  SELECT 'triggers', tgrelid::regclass::text || ' ' || pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND c.relnamespace IN ('public'::regnamespace, 'auth'::regnamespace)
  UNION ALL
  SELECT 'views', relname || ' md5=' || md5(replace(pg_get_viewdef(oid), E'\r', '')) FROM app_rel WHERE relkind IN ('v','m')
  UNION ALL
  SELECT 'enum types', t.typname || ' = ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname
  UNION ALL
  SELECT 'table permissions (anon/authenticated/service_role)', c.relname || ' ' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END || ' ' || x.privilege_type
  FROM app_rel c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated', 'service_role')
  UNION ALL
  SELECT 'function permissions (anon/authenticated/service_role)', f.proname || '(' || pg_get_function_identity_arguments(f.oid) || ') '
         || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END
  FROM app_fn f, aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) x
  WHERE x.grantee = 0 OR pg_get_userbyid(x.grantee) IN ('anon', 'authenticated', 'service_role')
  UNION ALL
  SELECT 'storage buckets', id || ' public=' || public::text || ' limit=' || coalesce(file_size_limit::text, '-') || ' types=' || coalesce(allowed_mime_types::text, '-')
  FROM storage.buckets
  UNION ALL
  SELECT 'scheduled jobs (cron)', jobname || ' [' || schedule || '] ' || command FROM cron.job
  UNION ALL
  SELECT 'migrations recorded', version FROM supabase_migrations.schema_migrations
),
items AS (
  SELECT cat, replace(item, E'\r', '') AS item FROM raw_items
),
actual AS (
  SELECT cat, count(*) AS n, md5(string_agg(item, E'\n' ORDER BY item COLLATE "C")) AS h FROM items GROUP BY cat
),
expected(cat, n, h) AS (
  VALUES
    ('columns', 1087, '2bc64d3232709f85a7da641a2fa90bb5'),
    ('constraints', 398, '3e8b88c1acf7427e4d338861f7d16218'),
    ('enum types', 3, '32ab8c4d2aa694991c0b59bdc9489e12'),
    ('function permissions (anon/authenticated/service_role)', 667, '4644c90c9f59fa8b3db92dce1b6f6330'),
    ('functions', 221, '65a86873e9530ee946c9d762adf8eff1'),
    ('indexes', 177, 'ac40a238493ef610d1ab7f9053b1bfa3'),
    ('migrations recorded', 139, '652bbd7b98b3b82db0ebbda891a329d3'),
    ('scheduled jobs (cron)', 15, '13e68b22cb8ced197ffecc085d61ef27'),
    ('security policies (RLS)', 185, '8e0d5675e449f75ba7c6c4f6a9cc4141'),
    ('storage buckets', 7, 'c8414cdc7cc22d277251349f23514f14'),
    ('table permissions (anon/authenticated/service_role)', 1786, '7e956c3c55d79d8c1f8b48065088dc5d'),
    ('tables', 77, 'c6ea9ba14b664c2a15235d23ce35ab21'),
    ('triggers', 117, '99951ded2c8016908c1a8b3ed7a3f7a4')
),
schema_rows AS (
  SELECT e.cat AS what, e.n AS expected, coalesce(a.n, 0) AS found,
         CASE WHEN a.h = e.h THEN 'OK'
              WHEN a.n IS NULL THEN 'MISSING - run STEP 1'
              ELSE 'DIFFERENT' END AS result
  FROM expected e LEFT JOIN actual a ON a.cat = e.cat
),
admin_rows AS (
  SELECT 'Admin account with super_admin role' AS what, 1::bigint AS expected,
         (SELECT count(*) FROM public.user_roles WHERE role::text = 'super_admin') AS found,
         CASE WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE role::text = 'super_admin') THEN 'OK'
              ELSE 'MISSING - run STEP 2' END AS result
),
vault AS (
  SELECT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') AS url,
         (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key') AS k
),
vault_claims AS (
  SELECT url, k, substring(rtrim(url, '/') FROM '^https://([a-z0-9]{20})\.supabase\.co$') AS url_ref,
         CASE WHEN k ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
           convert_from(decode(rpad(translate(split_part(k, '.', 2), '-_', '+/'),
                                    ((length(split_part(k, '.', 2)) + 3) / 4) * 4, '='), 'base64'), 'UTF8')
         END AS payload
  FROM vault
),
vault_rows AS (
  SELECT 'Vault secret: project_url' AS what, NULL::bigint AS expected, NULL::bigint AS found,
         CASE WHEN url IS NULL THEN 'MISSING - run STEP 3'
              WHEN url_ref IS NULL THEN 'WRONG - it is ' || url || ', run STEP 3 again'
              WHEN url_ref = 'whycxtnjhdbewgyugfax' THEN 'WRONG - points to LIVE, run STEP 3 again'
              ELSE 'OK' END AS result
  FROM vault_claims
  UNION ALL
  SELECT 'Vault secret: service_role_key', NULL, NULL,
         CASE WHEN k IS NULL THEN 'MISSING - run STEP 3'
              WHEN payload IS NULL OR NOT pg_input_is_valid(payload, 'jsonb') THEN 'WRONG - not the legacy service_role key (must start with eyJ), run STEP 3 again'
              WHEN payload::jsonb ->> 'role' IS DISTINCT FROM 'service_role' THEN 'WRONG - this is the ' || coalesce(payload::jsonb ->> 'role', '?') || ' key, not service_role, run STEP 3 again'
              WHEN payload::jsonb ->> 'ref' = 'whycxtnjhdbewgyugfax' THEN 'WRONG - this is the LIVE key, run STEP 3 again'
              WHEN payload::jsonb ->> 'ref' IS DISTINCT FROM url_ref THEN 'WRONG - key is for project ' || coalesce(payload::jsonb ->> 'ref', '?') || ', not the project_url one, run STEP 3 again'
              ELSE 'OK' END
  FROM vault_claims
)
SELECT what, expected, found, result FROM schema_rows
UNION ALL
SELECT what, expected, found, result FROM admin_rows
UNION ALL
SELECT what, expected, found, result FROM vault_rows
ORDER BY 1;
