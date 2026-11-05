-- Admin vendor details read vendors.pan_number, but the seller registration
-- form only saved the PAN in vendor_kyc - so a newly registered boutique's
-- PAN showed empty (Developer Corrections Part 7, 7.2). Copy it across on
-- registration (never over a PAN an admin already typed) and fill in the
-- boutiques that registered before this.

CREATE OR REPLACE FUNCTION public.copy_kyc_pan_to_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vendors
  SET pan_number = NEW.pan
  WHERE id = NEW.vendor_id AND (pan_number IS NULL OR btrim(pan_number) = '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_kyc_copy_pan ON public.vendor_kyc;
CREATE TRIGGER vendor_kyc_copy_pan
  AFTER INSERT OR UPDATE OF pan ON public.vendor_kyc
  FOR EACH ROW EXECUTE FUNCTION public.copy_kyc_pan_to_vendor();

UPDATE public.vendors v
SET pan_number = k.pan
FROM public.vendor_kyc k
WHERE k.vendor_id = v.id AND (v.pan_number IS NULL OR btrim(v.pan_number) = '');
