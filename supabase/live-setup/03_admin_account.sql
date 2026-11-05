-- =====================================================================
-- AllBoutiqs LIVE database - STEP 3 of 5: the admin account
-- Project: allboutiqs-marketplace-live (whycxtnjhdbewgyugfax)
--
-- Creates the super admin dpandey@eglaftechnology.com (the same admin as
-- the old live database), email already confirmed, so it can sign in
-- straight away with email + password. No other account is created.
--
-- How to run:
--   1. SQL Editor -> New query -> paste this whole file.
--   2. In the SQL Editor (NOT in this file - never commit a password),
--      on the v_password line below, type the admin's password between
--      the quotes in place of the placeholder (at least 8 characters) -> Run.
--      Find-and-replace is fine: the placeholder appears only on that line.
--
-- If this email already has an account (for example it signed up on the
-- site), it only makes that account admin and does not touch its password.
-- Safe to run again.
-- =====================================================================

DO $admin$
DECLARE
  v_email    constant text := 'dpandey@eglaftechnology.com';
  v_password constant text := 'PASTE_NEW_PASSWORD_HERE';
  v_id       uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_id IS NULL THEN
    -- Checks only the prefix, so a find-and-replace of the placeholder
    -- cannot also rewrite this check.
    IF left(v_password, 6) = 'PASTE_' THEN
      RAISE EXCEPTION 'Type the admin password on the v_password line first. Nothing was saved.';
    END IF;
    IF length(v_password) < 8 THEN
      RAISE EXCEPTION 'Use a password of at least 8 characters for the admin. Nothing was saved.';
    END IF;

    v_id := gen_random_uuid();
    -- The four empty-text token columns have no default and Supabase Auth
    -- cannot sign in a user whose tokens are NULL.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(v_email),
      extensions.crypt(v_password, extensions.gen_salt('bf', 10)), now(),
      '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
      '', '', '', ''
    );
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (v_id::text, v_id,
            jsonb_build_object('sub', v_id::text, 'email', lower(v_email), 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END
$admin$;

SELECT u.email, r.role, u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
WHERE r.role = 'admin';
