-- "Verified Boutique" badge: off until an admin turns it on, and shown to
-- customers only while it's on.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Admin-only fields were only protected on UPDATE, but applicants INSERT
-- their own vendor row (the "Users can apply" policy only checks
-- status = 'pending'), so an applicant could create a row already marked
-- trusted/verified or with its own commission rate. Reset those on insert
-- for non-admins too.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := 10;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.has_role(auth.uid(), 'admin') THEN
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

DROP TRIGGER IF EXISTS protect_vendor_admin_fields_trigger ON public.vendors;
CREATE TRIGGER protect_vendor_admin_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_admin_fields();
