-- Complaint form (client list 2.11.2): anyone can raise a complaint from the
-- site footer, and supabase/functions/submit-complaint emails it to the
-- admins and a confirmation to the customer. The complaint itself is NOT
-- stored anywhere (client, 17 Nov 2026) - the emails are the record.
--
-- This table only stops the form being used to spam inboxes: one row per
-- sent complaint with a hash of the sender's IP and email (never the email
-- itself, never the complaint), kept for a day. Only the edge function
-- (service role) reads or writes it.
CREATE TABLE IF NOT EXISTS public.complaint_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text,
  email_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaint_rate_limits_email_created ON public.complaint_rate_limits (email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaint_rate_limits_ip_created ON public.complaint_rate_limits (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaint_rate_limits_created ON public.complaint_rate_limits (created_at);

ALTER TABLE public.complaint_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.complaint_rate_limits FROM anon, authenticated;
