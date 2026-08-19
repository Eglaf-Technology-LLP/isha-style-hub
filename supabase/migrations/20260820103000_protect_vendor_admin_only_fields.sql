-- "Vendor members can update their vendor" is row-scoped (is_vendor_member),
-- which is correct for letting a vendor edit their own shipping/returns/
-- description - but RLS has no column granularity, so as written it also
-- let any vendor UPDATE is_trusted, status, commission_rate, approved_by/
-- approved_at or owner_user_id on themselves directly via the API,
-- completely bypassing the trusted-partner/approval model this whole
-- marketplace is built around. Not theoretical - a plain
-- supabase.from('vendors').update({ is_trusted: true }) from any vendor's
-- own session would have worked.
--
-- RLS can't express "this row, but only these columns" on its own, so
-- enforce it with a trigger instead: non-admin writes to these columns
-- are silently reverted to their prior value rather than erroring, since
-- a vendor's own update calls legitimately resubmit the whole row and
-- should just leave admin-owned fields untouched.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;

  -- Exception: a vendor may kick off payout verification (-> 'pending')
  -- themselves, but can't mark their own account active/disabled - that
  -- only happens once the payment gateway (or an admin) verifies it.
  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vendor_admin_fields_trigger ON public.vendors;
CREATE TRIGGER protect_vendor_admin_fields_trigger
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_admin_fields();
