-- Courier partners' GST transporter IDs (Admin > E-way bills > Settings),
-- and the courier chosen for each e-way bill.
--
-- Shiprocket names a courier by its service ("Blue Dart Air", "Delhivery
-- Surface"), so a partner is matched by name: the first partner (by
-- sort_order) whose match_names word is in the courier's name, ignoring case,
-- spaces and punctuation. match_names may hold several words separated by
-- commas; empty = never matched (kept for reference).
--
-- When a boutique / the warehouse chooses the courier for a parcel over the
-- e-way bill limit, the partner's ID is saved on the e-way bill
-- (transporter_id / transporter_name, with eway_bills.courier_id /
-- courier_name). AllBoutiqs still makes the e-way bill as its transporter
-- (it can only make bills it is a party to); the admin page shows which
-- courier ID to set on the portal (e-Waybill > Update Transporter).
--
-- The old courier_transporters table (keyed by Shiprocket courier id) is
-- empty and unused; it is left as it is.

CREATE TABLE IF NOT EXISTS public.courier_partner_transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner text NOT NULL CHECK (length(btrim(partner)) BETWEEN 1 AND 60),
  match_names text NOT NULL DEFAULT '',
  transporter_id text NOT NULL CHECK (transporter_id ~ '^[0-9A-Z]{15}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.courier_partner_transporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read courier partner transporter IDs" ON public.courier_partner_transporters;
CREATE POLICY "Signed-in users read courier partner transporter IDs"
  ON public.courier_partner_transporters FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage courier partner transporter IDs" ON public.courier_partner_transporters;
CREATE POLICY "Admins manage courier partner transporter IDs"
  ON public.courier_partner_transporters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_courier_partner_transporters_updated_at ON public.courier_partner_transporters;
CREATE TRIGGER update_courier_partner_transporters_updated_at
  BEFORE UPDATE ON public.courier_partner_transporters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The list the client gave (18 Nov 2026). Dotzot is Blue Dart's, same ID.
-- DTDC has two: the GSTIN (07...) is used; the 88... one fails the GSTIN
-- check digit (the portal would expect ...H1ZK), so it is kept for reference
-- only and isn't matched (give it match_names to use it instead).
INSERT INTO public.courier_partner_transporters (partner, match_names, transporter_id, sort_order)
SELECT v.partner, v.match_names, v.transporter_id, v.sort_order
FROM (VALUES
  ('XpressBees',   'xpressbees',               '27AAGCB3904P2ZC', 10),
  ('Gati',         'gati',                     '36AADCG2096A1ZY', 20),
  ('Bluedart',     'bluedart',                 '27AAACB0446L1ZS', 30),
  ('Dotzot',       'dotzot',                   '27AAACB0446L1ZS', 40),
  ('Delhivery',    'delhivery',                '06AAPCS9575E1ZR', 50),
  ('Ecom Express', 'ecomexpress',              '07AADCE1344F1Z2', 60),
  ('FedEx',        'fedex',                    '27AABCF6516A1Z3', 70),
  ('DTDC (GST)',   'dtdc',                     '07AAACD8017H1ZU', 80),
  ('DTDC',         '',                         '88AAACD8017H1ZX', 90)
) AS v(partner, match_names, transporter_id, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.courier_partner_transporters);

-- The courier partner on each e-way bill (courier_id / courier_name already
-- exist from the first e-way bill set-up and are reused for the chosen
-- Shiprocket courier).
ALTER TABLE public.eway_bills
  ADD COLUMN IF NOT EXISTS transporter_id text CHECK (transporter_id IS NULL OR transporter_id ~ '^[0-9A-Z]{15}$'),
  ADD COLUMN IF NOT EXISTS transporter_name text,
  ADD COLUMN IF NOT EXISTS courier_chosen_at timestamptz;
