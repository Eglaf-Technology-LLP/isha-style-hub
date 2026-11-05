-- =====================================================================
-- AllBoutiqs LIVE database - STEP 5 of 5: check everything is in place
-- Project: allboutiqs-marketplace-live (whycxtnjhdbewgyugfax)
--
-- Read-only: it changes nothing, so it is safe to run any time.
-- How to run: SQL Editor -> New query -> paste this whole file -> Run.
--
-- It compares this database with a fingerprint of the old live database
-- (bldkjzitutojvnbbljrf, taken 2026-10-29, 3713 objects: structure +
-- basic settings), and checks the admin account and the Vault secrets.
-- Right after setup every row should say OK. If any row says something
-- else, send a screenshot of the result to the developer.
-- (Later, once the shop is in use, "basic settings" rows may say
-- DIFFERENT simply because settings were changed in Admin.)
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
items AS (
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
  UNION ALL
  SELECT 'indexes', indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 'security policies (RLS)', schemaname || '.' || tablename || ' ' || policyname || ' ' || permissive || ' ' || cmd || ' ' || roles::text
         || ' using(' || coalesce(qual, '') || ') check(' || coalesce(with_check, '') || ')'
  FROM pg_policies WHERE schemaname IN ('public', 'storage')
  UNION ALL
  SELECT 'functions', proname || '(' || pg_get_function_identity_arguments(oid) || ') md5=' || md5(pg_get_functiondef(oid))
  FROM app_fn WHERE prokind IN ('f','p')
  UNION ALL
  SELECT 'triggers', tgrelid::regclass::text || ' ' || pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND c.relnamespace IN ('public'::regnamespace, 'auth'::regnamespace)
  UNION ALL
  SELECT 'views', relname || ' md5=' || md5(pg_get_viewdef(oid)) FROM app_rel WHERE relkind IN ('v','m')
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
  UNION ALL
  SELECT 'basic settings: categories', ((to_jsonb(x) - 'id' - 'created_at' - 'updated_at' - 'hsn_code_id') || jsonb_build_object('hsn_code', h.code))::text
  FROM public.categories x LEFT JOIN public.hsn_codes h ON h.id = x.hsn_code_id
  UNION ALL
  SELECT 'basic settings: size charts', ((to_jsonb(x) - 'id' - 'created_at' - 'updated_at' - 'category_id') || jsonb_build_object('category', c.slug))::text
  FROM public.size_guides x LEFT JOIN public.categories c ON c.id = x.category_id
  UNION ALL
  SELECT 'basic settings: HSN codes', (to_jsonb(x) - 'id' - 'created_at' - 'updated_at')::text FROM public.hsn_codes x
  UNION ALL
  SELECT 'basic settings: warehouse', (to_jsonb(x) - 'id' - 'created_at' - 'updated_at')::text FROM public.warehouses x
  UNION ALL
  SELECT 'basic settings: Indian states', (to_jsonb(x) - 'id' - 'created_at')::text FROM public.indian_states x
  UNION ALL
  SELECT 'basic settings: platform settings', (to_jsonb(x) - 'created_at' - 'updated_at' - 'updated_by')::text FROM public.platform_settings x
  UNION ALL
  SELECT 'basic settings: platform rates', (to_jsonb(x) - 'id' - 'created_at' - 'updated_at' - 'created_by')::text FROM public.platform_rates x
),
actual AS (
  SELECT cat, count(*) AS n, md5(string_agg(item, E'\n' ORDER BY item COLLATE "C")) AS h FROM items GROUP BY cat
),
expected(cat, n, h) AS (
  VALUES
    ('basic settings: HSN codes', 22, 'a547c6b89d41092bac07579cc5a331c6'),
    ('basic settings: Indian states', 36, '6faa9c179aee981125450ef94d8297dd'),
    ('basic settings: categories', 4, '33347c9c744eb8a202eb1f40cca7b8aa'),
    ('basic settings: platform rates', 1, 'a2baa3ee78809981c795c0f0a9043fff'),
    ('basic settings: platform settings', 1, 'cdaef98992467365b0dec713e07c4e0c'),
    ('basic settings: size charts', 4, 'e8b2c3e93aed2215535568fd1ca934f8'),
    ('basic settings: warehouse', 1, '928dd35bf3e469ae4221996ec2591aaf'),
    ('columns', 808, '899e85a0c48cf97573512dce12c44b08'),
    ('constraints', 271, '7ce082e5f271de9a322e587feea62c47'),
    ('enum types', 3, '24c3df612b36b8d4d75ef5ca05ab1baa'),
    ('function permissions (anon/authenticated/service_role)', 476, 'dddbc69d829ec1eb6220b0cbe3111c26'),
    ('functions', 148, 'a913d52ee4db41d838fab75735945b28'),
    ('indexes', 129, 'abbb4cec89f49f00d38ba962f0aad893'),
    ('migrations recorded', 100, '5a49e0315bb80d4dcb981218bf4a3c3c'),
    ('scheduled jobs (cron)', 11, '69c5b6615340f7248e9a9e8e080c2488'),
    ('security policies (RLS)', 157, 'dd9bc6e441b2e817b98715b4664432de'),
    ('storage buckets', 5, 'd836da035b9bb4678749db4ce9164d08'),
    ('table permissions (anon/authenticated/service_role)', 1394, 'f27132db868d9b80c7aa2e703049a154'),
    ('tables', 60, '9926f3ba8bc7da2baec8ad1450dd84ea'),
    ('triggers', 82, 'efcd75165d693dfbcc3e9a98a3a089c2')
),
schema_rows AS (
  SELECT e.cat AS what, e.n AS expected, coalesce(a.n, 0) AS found,
         CASE WHEN a.h = e.h THEN 'OK'
              WHEN a.n IS NULL AND e.cat LIKE 'basic settings:%' THEN 'MISSING - run STEP 2'
              WHEN a.n IS NULL THEN 'MISSING - run STEP 1'
              WHEN e.cat LIKE 'basic settings:%' THEN 'DIFFERENT - run STEP 2'
              ELSE 'DIFFERENT' END AS result
  FROM expected e LEFT JOIN actual a ON a.cat = e.cat
),
admin AS (
  SELECT u.id, u.email_confirmed_at,
         EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin,
         EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email') AS has_identity
  FROM auth.users u WHERE lower(u.email) = 'dpandey@eglaftechnology.com'
),
admin_rows AS (
  SELECT 'Admin account: dpandey@eglaftechnology.com' AS what, 1::bigint AS expected, (SELECT count(*) FROM admin) AS found,
         CASE WHEN NOT EXISTS (SELECT 1 FROM admin) THEN 'MISSING - run STEP 3'
              WHEN NOT (SELECT is_admin FROM admin) THEN 'NOT ADMIN - run STEP 3'
              WHEN (SELECT email_confirmed_at FROM admin) IS NULL OR NOT (SELECT has_identity FROM admin) THEN 'INCOMPLETE - send this to the developer'
              ELSE 'OK' END AS result
  UNION ALL
  SELECT 'User accounts in total (setup: only the admin)', 1, (SELECT count(*) FROM auth.users),
         CASE WHEN (SELECT count(*) FROM auth.users) = 1 THEN 'OK'
              ELSE 'INFO - ' || (SELECT count(*) FROM auth.users) || ' accounts' END
),
vault AS (
  SELECT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') AS url,
         (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key') AS k
),
vault_claims AS (
  SELECT url, k,
         CASE WHEN k ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
           convert_from(decode(rpad(translate(split_part(k, '.', 2), '-_', '+/'),
                                    ((length(split_part(k, '.', 2)) + 3) / 4) * 4, '='), 'base64'), 'UTF8')
         END AS payload
  FROM vault
),
vault_rows AS (
  SELECT 'Vault secret: project_url' AS what, NULL::bigint AS expected, NULL::bigint AS found,
         CASE WHEN url IS NULL THEN 'MISSING - run STEP 4'
              WHEN rtrim(url, '/') = 'https://whycxtnjhdbewgyugfax.supabase.co' THEN 'OK'
              ELSE 'WRONG - it is ' || url || ', run STEP 4 again' END AS result
  FROM vault_claims
  UNION ALL
  SELECT 'Vault secret: service_role_key', NULL, NULL,
         CASE WHEN k IS NULL THEN 'MISSING - run STEP 4'
              WHEN payload IS NULL OR NOT pg_input_is_valid(payload, 'jsonb') THEN 'WRONG - not the legacy service_role key (must start with eyJ), run STEP 4 again'
              WHEN payload::jsonb ->> 'role' IS DISTINCT FROM 'service_role' THEN 'WRONG - this is the ' || coalesce(payload::jsonb ->> 'role', '?') || ' key, not service_role, run STEP 4 again'
              WHEN payload::jsonb ->> 'ref' IS DISTINCT FROM 'whycxtnjhdbewgyugfax' THEN 'WRONG - this key belongs to project ' || coalesce(payload::jsonb ->> 'ref', '?') || ', run STEP 4 again'
              ELSE 'OK' END
  FROM vault_claims
)
SELECT what, expected, found, result FROM schema_rows
UNION ALL
SELECT what, expected, found, result FROM admin_rows
UNION ALL
SELECT what, expected, found, result FROM vault_rows
ORDER BY 1;
