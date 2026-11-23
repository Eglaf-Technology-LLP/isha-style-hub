-- =====================================================================
-- AllBoutiqs STAGE database - STEP 3: two Vault secrets
--
-- Why: the 15 scheduled jobs from STEP 1 (unpaid-order release, COD sync,
-- payouts, media clean-up, ...) call the edge functions through
-- public.invoke_edge_function(), which reads the project URL and the
-- service_role key from Vault. Without these two secrets the jobs run but
-- quietly skip every call.
--
-- How to run:
--   1. Stage project -> Project Settings -> API Keys -> "Legacy API Keys"
--      tab -> service_role -> Reveal -> copy. It is a long key starting
--      with eyJ. (Not the new sb_secret_... key: the functions check the
--      key's role claim, which only the legacy JWT key carries.)
--   2. SQL Editor -> New query -> paste this whole file.
--   3. In the SQL Editor (NOT in this file - never commit the key), replace
--      the two placeholders: the stage project's URL on the v_url line
--      (https://<stage-ref>.supabase.co) and the key on the v_key line -> Run.
--
-- It refuses a wrong key (the anon key, an sb_secret_ key, a key of another
-- project than the URL) and refuses the LIVE project, so stage jobs can
-- never call live. Nothing is saved in that case. Safe to run again: it
-- updates the two secrets instead of adding duplicates.
-- =====================================================================

DO $vault$
DECLARE
  v_url    constant text := 'PASTE_STAGE_PROJECT_URL_HERE';
  v_key    constant text := 'PASTE_LEGACY_SERVICE_ROLE_KEY_HERE';
  v_live   constant text := 'whycxtnjhdbewgyugfax';
  v_ref    text;
  v_claims jsonb;
  v_id     uuid;
BEGIN
  -- Checks only the prefix, so a find-and-replace of a placeholder
  -- cannot also rewrite this check.
  IF left(v_url, 6) = 'PASTE_' THEN
    RAISE EXCEPTION 'Paste the stage project URL on the v_url line first. Nothing was saved.';
  END IF;
  v_ref := substring(rtrim(v_url, '/') FROM '^https://([a-z0-9]{20})\.supabase\.co$');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'The URL must look like https://<20-letter ref>.supabase.co - got %. Nothing was saved.', v_url;
  END IF;
  IF v_ref = v_live THEN
    RAISE EXCEPTION 'That is the LIVE project URL. Use the stage project URL. Nothing was saved.';
  END IF;

  IF left(v_key, 6) = 'PASTE_' THEN
    RAISE EXCEPTION 'Paste the legacy service_role key on the v_key line first. Nothing was saved.';
  END IF;
  IF v_key !~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'That is not the legacy service_role key - it must start with eyJ (sb_secret_ keys do not work here). Nothing was saved.';
  END IF;

  v_claims := convert_from(decode(rpad(translate(split_part(v_key, '.', 2), '-_', '+/'),
                                       ((length(split_part(v_key, '.', 2)) + 3) / 4) * 4, '='), 'base64'), 'UTF8')::jsonb;
  IF v_claims ->> 'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'That is the % key - copy the service_role key instead. Nothing was saved.', coalesce(v_claims ->> 'role', 'unknown');
  END IF;
  IF v_claims ->> 'ref' = v_live THEN
    RAISE EXCEPTION 'That is the LIVE project key. Use the stage project key. Nothing was saved.';
  END IF;
  IF v_claims ->> 'ref' IS DISTINCT FROM v_ref THEN
    RAISE EXCEPTION 'That key belongs to project %, but the URL is project %. Nothing was saved.', coalesce(v_claims ->> 'ref', 'unknown'), v_ref;
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'project_url';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(rtrim(v_url, '/'), 'project_url', 'Used by public.invoke_edge_function()');
  ELSE
    PERFORM vault.update_secret(v_id, rtrim(v_url, '/'));
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
