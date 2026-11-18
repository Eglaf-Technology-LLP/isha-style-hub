-- "Create account" with an email or mobile number that already has an
-- AllBoutiqs account: the form says it's already registered and moves the
-- person to Sign in with it filled in (client corrections, 15 Nov 2026,
-- 1.2.2). Only yes/no comes back - never the account or any detail of it.
-- Mobile numbers are compared as digits; auth.users keeps them without the
-- "+" (919876543210), the form sends +919876543210.

CREATE OR REPLACE FUNCTION public.auth_account_exists(_email text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.deleted_at IS NULL
      AND (
        (nullif(btrim(_email), '') IS NOT NULL AND lower(u.email) = lower(btrim(_email)))
        OR (
          nullif(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), '') IS NOT NULL
          AND u.phone = regexp_replace(_phone, '\D', '', 'g')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.auth_account_exists(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.auth_account_exists(text, text) TO anon, authenticated;
