-- Complaint form (client list 2.11.2): every complaint is saved here
-- (client, 18 Nov 2026) but shown nowhere - not on the site, not in the
-- admin panel. The admins get each one by email; the customer gets a
-- confirmation with the ticket number. Only the submit-complaint edge
-- function (service role) reads or writes this table.
CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket text NOT NULL UNIQUE,
  -- Backstops only: the function checks the real limits (JS counts an emoji
  -- as 2 characters, Postgres as 1, so the minimums here are looser).
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (char_length(email) <= 254),
  phone text NOT NULL CHECK (char_length(phone) <= 20),
  category text NOT NULL CHECK (
    category IN ('order', 'delivery', 'return_refund', 'payment', 'product', 'boutique', 'website', 'other')
  ),
  order_number text CHECK (char_length(order_number) <= 40),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000),
  -- Who sent it, when they were signed in.
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Hash of the sender's IP, only for the "5 per network an hour" limit.
  ip_hash text,
  -- When the admins' copy / the customer's confirmation went out (null =
  -- it didn't, e.g. the mail server was down).
  admins_emailed_at timestamptz,
  customer_emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.complaints IS
  'Complaints from the site''s complaint form (client list 2.11.2). Saved only, shown nowhere; admins are emailed each one. Written by the submit-complaint edge function.';

CREATE INDEX IF NOT EXISTS idx_complaints_email_created ON public.complaints (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_ip_created ON public.complaints (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON public.complaints (created_at DESC);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.complaints FROM anon, authenticated;

-- The hashes-only limits table from 17 Nov isn't needed any more: the
-- limits now count the saved complaints. It never held a row (the function
-- was first deployed with this migration).
DROP TABLE IF EXISTS public.complaint_rate_limits;
