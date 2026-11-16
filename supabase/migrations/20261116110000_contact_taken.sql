-- My Account: the email or mobile number someone adds must not belong to
-- another account (client, 16 Nov 2026). Also used when the first saved
-- address's mobile number is copied into the profile: a number another
-- account has stays on the address only.

-- One form for every way a mobile number gets typed: digits only, Indian
-- 10-digit numbers (and 0 + 10 digits) with 91 in front - the way
-- auth.users keeps them (919876543210).
CREATE OR REPLACE FUNCTION public.phone_key(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN d ~ '^[6-9][0-9]{9}$' THEN '91' || d
    WHEN d ~ '^0[6-9][0-9]{9}$' THEN '91' || substr(d, 2)
    ELSE nullif(d, '')
  END
  FROM (SELECT regexp_replace(coalesce(_phone, ''), '\D', '', 'g') AS d) s;
$$;

-- True when ANOTHER account (not the caller's) signs in with this email /
-- number, or has the number in its profile. Yes/no only.
CREATE OR REPLACE FUNCTION public.contact_taken(_email text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (
      nullif(btrim(_email), '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id <> auth.uid() AND u.deleted_at IS NULL AND lower(u.email) = lower(btrim(_email))
      )
    )
    OR (
      public.phone_key(_phone) IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id <> auth.uid() AND u.deleted_at IS NULL AND u.phone = public.phone_key(_phone)
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id <> auth.uid() AND public.phone_key(p.phone) = public.phone_key(_phone)
        )
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.contact_taken(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contact_taken(text, text) TO authenticated;
