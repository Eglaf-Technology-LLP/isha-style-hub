-- "MSME / Udyam Certificate (optional)" was offered only to a Proprietorship
-- and an HUF; a Partnership, LLP or Private Limited / OPC can have Udyam too
-- (client corrections Part 2, A21.2). Optional for all five types; the
-- registration form's list matches (src/lib/vendorKyc.ts).
CREATE OR REPLACE FUNCTION public.vendor_optional_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['aadhaar_card', 'msme_certificate']
    WHEN 'partnership' THEN ARRAY['aadhaar_card', 'rof_certificate', 'msme_certificate']
    WHEN 'llp' THEN ARRAY['aadhaar_card', 'msme_certificate']
    WHEN 'private_limited' THEN ARRAY['aadhaar_card', 'msme_certificate']
    WHEN 'huf' THEN ARRAY['aadhaar_card', 'msme_certificate']
    ELSE ARRAY[]::text[]
  END;
$$;
