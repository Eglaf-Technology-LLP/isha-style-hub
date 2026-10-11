-- Fees & taxes that admins can change at any time, each set with the date
-- it applies from (step 6). Orders, fee invoices and statements use the
-- rates in force on their date, so old invoices keep their old rates.
-- Versions that have already started can't be edited or deleted; admins
-- add a new version instead.

CREATE TABLE IF NOT EXISTS public.platform_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from date NOT NULL UNIQUE,
  -- AllBoutiqs fees on product value (taxable value after discount)
  marketplace_commission_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (marketplace_commission_pct BETWEEN 0 AND 100),
  technology_fee_pct numeric(5,2) NOT NULL DEFAULT 2 CHECK (technology_fee_pct BETWEEN 0 AND 100),
  fee_gst_pct numeric(5,2) NOT NULL DEFAULT 18 CHECK (fee_gst_pct BETWEEN 0 AND 40),
  fee_sac_code text NOT NULL DEFAULT '998599',
  -- Online payments only (Razorpay's fee incl. its GST); none on COD
  payment_gateway_fee_pct numeric(5,2) NOT NULL DEFAULT 2.36 CHECK (payment_gateway_fee_pct BETWEEN 0 AND 100),
  -- Courier cost of each parcel recovered from the boutique's payout
  -- (AllBoutiqs currently bears it, so off by default)
  charge_courier_to_boutique boolean NOT NULL DEFAULT false,
  -- GST TCS (0.25% CGST + 0.25% SGST same state, else 0.5% IGST)
  gst_tcs_pct numeric(5,3) NOT NULL DEFAULT 0.5 CHECK (gst_tcs_pct BETWEEN 0 AND 10),
  -- Income-tax TDS (194-O)
  tds_pct numeric(5,3) NOT NULL DEFAULT 0.1 CHECK (tds_pct BETWEEN 0 AND 10),
  tds_no_pan_pct numeric(5,3) NOT NULL DEFAULT 5 CHECK (tds_no_pan_pct BETWEEN 0 AND 30),
  tds_individual_exempt_upto numeric(14,2) NOT NULL DEFAULT 500000,
  -- Weekly payouts: orders delivered at least payout_hold_hours ago by the
  -- cut-off (ISO weekday 1=Mon..7=Sun, IST) are paid on payout_weekday
  payout_hold_hours integer NOT NULL DEFAULT 24 CHECK (payout_hold_hours BETWEEN 0 AND 2160),
  payout_cutoff_weekday smallint NOT NULL DEFAULT 2 CHECK (payout_cutoff_weekday BETWEEN 1 AND 7),
  payout_cutoff_time time NOT NULL DEFAULT '23:59',
  payout_weekday smallint NOT NULL DEFAULT 3 CHECK (payout_weekday BETWEEN 1 AND 7),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.platform_rates ENABLE ROW LEVEL SECURITY;
-- Boutiques see the rates their statements use.
CREATE POLICY "Signed-in users read rates" ON public.platform_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins add rates" ON public.platform_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND effective_from >= (now() AT TIME ZONE 'Asia/Kolkata')::date);
CREATE POLICY "Admins change future rates" ON public.platform_rates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins remove future rates" ON public.platform_rates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Rates that have already started are history: no edits, no deletes.
CREATE OR REPLACE FUNCTION public.protect_started_rates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF OLD.effective_from <= v_today AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'These rates have been in force since % - add a new set of rates with a future date instead', OLD.effective_from;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.effective_from < v_today THEN
    RAISE EXCEPTION 'Rates can only start today or later';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS protect_started_rates_trigger ON public.platform_rates;
CREATE TRIGGER protect_started_rates_trigger BEFORE UPDATE OR DELETE ON public.platform_rates
  FOR EACH ROW EXECUTE FUNCTION public.protect_started_rates();

CREATE OR REPLACE FUNCTION public.stamp_rates_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_by := coalesce(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_rates_creator_trigger ON public.platform_rates;
CREATE TRIGGER stamp_rates_creator_trigger BEFORE INSERT ON public.platform_rates
  FOR EACH ROW EXECUTE FUNCTION public.stamp_rates_creator();

-- The rates in force at a moment (IST date).
CREATE OR REPLACE FUNCTION public.rates_on(_at timestamptz)
RETURNS public.platform_rates
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.platform_rates
  WHERE effective_from <= (_at AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- Starting rates (as per the AllBoutiqs brief of 9 Oct 2026).
INSERT INTO public.platform_rates (effective_from, note)
VALUES ('2026-10-01', 'Starting rates from the AllBoutiqs brief (9 Oct 2026)')
ON CONFLICT (effective_from) DO NOTHING;

-- A boutique's own commission is now an optional override: NULL = the
-- platform's marketplace commission in force.
ALTER TABLE public.vendors ALTER COLUMN commission_rate DROP NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN commission_rate DROP DEFAULT;
UPDATE public.vendors SET commission_rate = NULL WHERE commission_rate = 10;

CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_privileged_writer() THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := NULL;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;
