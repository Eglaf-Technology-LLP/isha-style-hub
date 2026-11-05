-- 1. Permanent boutique code - AB0001, AB0002, ... assigned once at
-- creation, shown to customers, never changes for the vendor's lifetime.
-- A plain sequence-backed column default (not a trigger) keeps assignment
-- atomic and gap-free under concurrent inserts.
CREATE SEQUENCE public.boutique_code_seq;

ALTER TABLE public.vendors
  ADD COLUMN boutique_code text UNIQUE
    DEFAULT ('AB' || LPAD(nextval('public.boutique_code_seq')::text, 4, '0'));

-- Backfill existing vendors in signup order, so the codes already in the
-- system stay stable and match how long each vendor has been on the
-- platform.
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT id FROM public.vendors WHERE boutique_code IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.vendors
    SET boutique_code = 'AB' || LPAD(nextval('public.boutique_code_seq')::text, 4, '0')
    WHERE id = v.id;
  END LOOP;
END $$;

ALTER TABLE public.vendors ALTER COLUMN boutique_code SET NOT NULL;

-- 2. Per-vendor COD / returns kill switches - independent of the existing
-- per-product `products.is_returnable` (that one stays; this is the
-- vendor-wide override on top of it - an item is only actually returnable
-- if both are true).
ALTER TABLE public.vendors
  ADD COLUMN cod_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN returns_enabled boolean NOT NULL DEFAULT true;

-- boutique_code is permanent - immutable for every role, including admin,
-- not just protected from vendor self-edits like the other admin-only
-- columns below.
CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.boutique_code := OLD.boutique_code;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
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
