-- Passwordless sign-in / sign-up: a 6-digit code is emailed (our own SMTP,
-- see supabase/functions/auth-email-otp) and exchanged for a normal
-- Supabase session. Only a keyed hash of each code is stored. Everything
-- here is service-role only - clients never read or write these rows.

CREATE TABLE IF NOT EXISTS public.auth_email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  ip text,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_email_otps_email_created ON public.auth_email_otps (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_email_otps_ip_created ON public.auth_email_otps (ip, created_at DESC);

ALTER TABLE public.auth_email_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_email_otps FROM anon, authenticated;

-- Counts a guess before it's checked, so parallel requests can't get more
-- than the allowed number of tries. Returns the attempt number, or NULL
-- when the code is used up, already consumed or expired.
CREATE OR REPLACE FUNCTION public.claim_email_otp_attempt(_id uuid, _max_attempts integer)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.auth_email_otps
  SET attempts = attempts + 1
  WHERE id = _id AND consumed_at IS NULL AND expires_at > now() AND attempts < _max_attempts
  RETURNING attempts;
$$;
REVOKE ALL ON FUNCTION public.claim_email_otp_attempt(uuid, integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM public, anon, authenticated;

SELECT cron.schedule(
  'purge-auth-email-otps',
  '15 2 * * *',
  $$DELETE FROM public.auth_email_otps WHERE created_at < now() - interval '1 day';$$
);
