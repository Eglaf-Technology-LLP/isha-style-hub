-- A mobile number added in My Account is now verified by SMS and becomes a
-- sign-in number, and addresses no longer copy their number into the
-- profile (client, 16 Nov 2026). So only what another account SIGNS IN
-- with counts as taken - an unverified number typed into someone else's
-- profile must not stop the number's real owner from verifying it.

CREATE OR REPLACE FUNCTION public.contact_taken(_email text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id <> auth.uid()
      AND u.deleted_at IS NULL
      AND (
        (nullif(btrim(_email), '') IS NOT NULL AND lower(u.email) = lower(btrim(_email)))
        OR (public.phone_key(_phone) IS NOT NULL AND u.phone = public.phone_key(_phone))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.contact_taken(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contact_taken(text, text) TO authenticated;
