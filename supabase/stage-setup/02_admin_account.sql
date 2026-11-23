-- =====================================================================
-- AllBoutiqs STAGE database - STEP 2: the first admin account
--
-- Creates one admin with the roles admin + super_admin, email already
-- confirmed, so it can sign in straight away with email + password.
-- super_admin is needed here because only a super admin can give that
-- role to anyone later, from inside the app.
--
-- How to run:
--   1. Stage project -> SQL Editor -> New query -> paste this whole file.
--   2. In the SQL Editor (NOT in this file - never commit a password),
--      replace the two placeholders on the v_email and v_password lines
--      (password: at least 8 characters) -> Run.
--
-- If this email already has an account, it only adds the two roles and
-- does not touch its password. Safe to run again.
-- =====================================================================

DO $admin$
DECLARE
  v_email    constant text := 'PASTE_ADMIN_EMAIL_HERE';
  v_password constant text := 'PASTE_NEW_PASSWORD_HERE';
  v_id       uuid;
BEGIN
  -- Checks only the prefix, so a find-and-replace of a placeholder
  -- cannot also rewrite this check.
  IF left(v_email, 6) = 'PASTE_' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'Type the admin email on the v_email line first. Nothing was saved.';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_id IS NULL THEN
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

  INSERT INTO public.user_roles (user_id, role) VALUES (v_id, 'admin'), (v_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END
$admin$;

SELECT u.email, string_agg(r.role::text, ', ' ORDER BY r.role::text) AS roles,
       u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
WHERE r.role::text IN ('admin', 'super_admin')
GROUP BY u.email, u.email_confirmed_at;
