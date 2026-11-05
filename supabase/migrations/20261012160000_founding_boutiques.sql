-- Founding Boutique (step 7): admins tick a boutique as a Founding Boutique
-- (shows a Founding badge) and set its period - 2 months from launch, or
-- any dates. During that period the marketplace commission is 0%; every
-- other charge still applies.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_founding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_from date,
  ADD COLUMN IF NOT EXISTS founding_until date,
  ADD CONSTRAINT vendors_founding_period_check
    CHECK (founding_from IS NULL OR founding_until IS NULL OR founding_until >= founding_from);

-- The marketplace launch date, for the "2 months from launch" preset.
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS launch_date date;

-- Commission % for a boutique on a date: 0 inside its Founding period,
-- else its own override, else the platform rate in force.
CREATE OR REPLACE FUNCTION public.effective_commission_pct(_vendor_id uuid, _at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN v.is_founding
     AND (v.founding_from IS NULL OR (_at AT TIME ZONE 'Asia/Kolkata')::date >= v.founding_from)
     AND (v.founding_until IS NULL OR (_at AT TIME ZONE 'Asia/Kolkata')::date <= v.founding_until)
    THEN 0
    ELSE coalesce(v.commission_rate, (public.rates_on(_at)).marketplace_commission_pct)
  END
  FROM public.vendors v
  WHERE v.id = _vendor_id;
$$;

-- Founding status is admin-only, like trust and commission.
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
      NEW.is_founding := false;
      NEW.founding_from := NULL;
      NEW.founding_until := NULL;
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
  NEW.is_founding := OLD.is_founding;
  NEW.founding_from := OLD.founding_from;
  NEW.founding_until := OLD.founding_until;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;
