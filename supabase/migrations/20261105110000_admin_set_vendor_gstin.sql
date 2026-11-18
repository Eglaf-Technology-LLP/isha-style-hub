-- A boutique's GSTIN lives in two places: vendor_kyc.gstin (from seller
-- registration; invoices, fee invoices and e-way bills use it first) and
-- vendors.gst_number (Store Settings / Admin > Vendors > Details). Admins
-- could only change the second, so a corrected GSTIN never reached invoices
-- or e-way bills. Admin > Vendors > Details now saves through
-- admin_set_vendor_gstin, which updates both - and the PAN, which is
-- characters 3-12 of the GSTIN. Boutiques still can't change their KYC GSTIN.

-- GSTN's checksum: the 15th character is computed from the first 14, so a
-- typo or a made-up number fails (the e-way bill portal rejects those).
CREATE OR REPLACE FUNCTION public.gstin_is_valid(_gstin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_gstin text := upper(btrim(coalesce(_gstin, '')));
  v_sum integer := 0;
  v_product integer;
BEGIN
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RETURN false;
  END IF;
  FOR i IN 1..14 LOOP
    v_product := (position(substr(v_gstin, i, 1) IN v_chars) - 1) * (CASE WHEN i % 2 = 1 THEN 1 ELSE 2 END);
    v_sum := v_sum + v_product / 36 + v_product % 36;
  END LOOP;
  RETURN substr(v_chars, (36 - v_sum % 36) % 36 + 1, 1) = substr(v_gstin, 15, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_vendor_gstin(_vendor_id uuid, _gstin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gstin text := upper(btrim(coalesce(_gstin, '')));
  v_pan text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can change a boutique''s GSTIN';
  END IF;
  IF NOT public.gstin_is_valid(v_gstin) THEN
    RAISE EXCEPTION 'GSTIN % isn''t valid - check it against the GST certificate', v_gstin;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = _vendor_id) THEN
    RAISE EXCEPTION 'Boutique not found';
  END IF;
  v_pan := substr(v_gstin, 3, 10);
  UPDATE vendors SET gst_number = v_gstin, pan_number = v_pan WHERE id = _vendor_id;
  UPDATE vendor_kyc SET gstin = v_gstin, pan = v_pan, updated_at = now() WHERE vendor_id = _vendor_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_vendor_gstin(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_vendor_gstin(uuid, text) TO authenticated;
