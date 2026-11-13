-- The Aadhaar card is optional for every business type (client, 13 Nov
-- 2026): registration no longer refuses an application without it, and one
-- that comes with it is still accepted. Same lists as src/lib/vendorKyc.ts
-- (DOCUMENTS_BY_CONSTITUTION). Changes no data.

CREATE OR REPLACE FUNCTION public.vendor_required_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['gst_certificate', 'pan_card']
    WHEN 'partnership' THEN ARRAY['gst_certificate', 'pan_card', 'partnership_deed']
    WHEN 'llp' THEN ARRAY['gst_certificate', 'pan_card', 'llp_incorporation']
    WHEN 'private_limited' THEN ARRAY['gst_certificate', 'pan_card', 'company_incorporation']
    WHEN 'huf' THEN ARRAY['pan_card', 'gst_certificate']
  END || ARRAY['bank_proof'];
$$;

CREATE OR REPLACE FUNCTION public.vendor_optional_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['aadhaar_card', 'msme_certificate']
    WHEN 'partnership' THEN ARRAY['aadhaar_card', 'rof_certificate']
    WHEN 'llp' THEN ARRAY['aadhaar_card']
    WHEN 'private_limited' THEN ARRAY['aadhaar_card']
    WHEN 'huf' THEN ARRAY['aadhaar_card', 'msme_certificate']
    ELSE ARRAY[]::text[]
  END;
$$;
