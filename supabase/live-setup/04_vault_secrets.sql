-- =====================================================================
-- AllBoutiqs LIVE database - STEP 4 of 5: two Vault secrets
-- Project: allboutiqs-marketplace-live (whycxtnjhdbewgyugfax)
--
-- Why: the 11 scheduled jobs from STEP 1 (unpaid-order release, COD sync,
-- payouts, ...) call the edge functions through public.invoke_edge_function(),
-- which reads the project URL and the service_role key from Vault. Without
-- these two secrets the jobs run but quietly skip every call.
--
-- How to run:
--   1. Dashboard -> Project Settings -> API Keys -> "Legacy API Keys" tab
--      -> service_role -> Reveal -> copy. It is a long key starting with eyJ.
--      (Not the new sb_secret_... key: the functions check the key's role
--      claim, which only the legacy JWT key carries.)
--   2. SQL Editor -> New query -> paste this whole file.
--   3. In the SQL Editor (NOT in this file - never commit the key), replace
--      PASTE_LEGACY_SERVICE_ROLE_KEY_HERE with the key you copied -> Run.
--
-- It refuses a wrong key (the anon key, a key of another project, an
-- sb_secret_ key) and saves nothing in that case. Safe to run again: it
-- updates the two secrets instead of adding duplicates.
-- =====================================================================

DO $vault$
DECLARE
  v_url    constant text := 'https://whycxtnjhdbewgyugfax.supabase.co';
  v_key    constant text := 'PASTE_LEGACY_SERVICE_ROLE_KEY_HERE';
  v_claims jsonb;
  v_id     uuid;
BEGIN
  IF v_key = 'PASTE_LEGACY_SERVICE_ROLE_KEY_HERE' THEN
    RAISE EXCEPTION 'Paste the legacy service_role key in place of PASTE_LEGACY_SERVICE_ROLE_KEY_HERE first. Nothing was saved.';
  END IF;
  IF v_key !~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'That is not the legacy service_role key - it must start with eyJ (sb_secret_ keys do not work here). Nothing was saved.';
  END IF;

  v_claims := convert_from(decode(rpad(translate(split_part(v_key, '.', 2), '-_', '+/'),
                                       ((length(split_part(v_key, '.', 2)) + 3) / 4) * 4, '='), 'base64'), 'UTF8')::jsonb;
  IF v_claims ->> 'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'That is the % key - copy the service_role key instead. Nothing was saved.', coalesce(v_claims ->> 'role', 'unknown');
  END IF;
  IF v_claims ->> 'ref' IS DISTINCT FROM 'whycxtnjhdbewgyugfax' THEN
    RAISE EXCEPTION 'That key belongs to project %, not the live project whycxtnjhdbewgyugfax. Nothing was saved.', coalesce(v_claims ->> 'ref', 'unknown');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'project_url';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_url, 'project_url', 'Used by public.invoke_edge_function()');
  ELSE
    PERFORM vault.update_secret(v_id, v_url);
  END IF;

  v_id := NULL;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'service_role_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_key, 'service_role_key', 'Used by public.invoke_edge_function()');
  ELSE
    PERFORM vault.update_secret(v_id, v_key);
  END IF;
END
$vault$;

SELECT name AS saved_secret, updated_at FROM vault.secrets
WHERE name IN ('project_url', 'service_role_key') ORDER BY name;
