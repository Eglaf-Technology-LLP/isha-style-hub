-- Seller registration: business constitution, the documents each
-- constitution requires (PDF only), bank details with proof, authorized /
-- contact person and contact numbers.
--
-- Kept out of `vendors` on purpose: approved vendors' rows are readable by
-- anyone (storefront), these are not - only the boutique's own members and
-- admins can read them. The whole application is submitted through one
-- function that validates it and creates the vendor, its owner membership,
-- KYC record, documents and payout account together.

-- ---------- KYC record (one per vendor) ----------

CREATE TABLE IF NOT EXISTS public.vendor_kyc (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  business_constitution text NOT NULL
    CHECK (business_constitution IN ('proprietorship', 'partnership', 'llp', 'private_limited')),
  legal_business_name text NOT NULL,
  pan text NOT NULL CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  gstin text CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  primary_mobile text NOT NULL,
  alternate_mobile text NOT NULL,
  business_email text NOT NULL,
  authorized_name text NOT NULL,
  authorized_designation text NOT NULL,
  authorized_mobile text NOT NULL,
  authorized_email text NOT NULL,
  contact_same_as_authorized boolean NOT NULL DEFAULT true,
  contact_name text,
  contact_designation text,
  contact_mobile text,
  contact_email text,
  bank_proof_type text NOT NULL CHECK (bank_proof_type IN ('cancelled_cheque', 'bank_letter', 'bank_statement')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_kyc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor members and admins read KYC"
  ON public.vendor_kyc FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

-- ---------- documents ----------

CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN (
    'pan_card', 'aadhaar_card', 'gst_certificate', 'msme_certificate', 'partnership_deed',
    'rof_certificate', 'llp_incorporation', 'company_incorporation', 'bank_proof')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, doc_type)
);

ALTER TABLE public.vendor_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor members and admins read documents"
  ON public.vendor_documents FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.vendor_payout_accounts ADD COLUMN IF NOT EXISTS bank_name text;

-- Private bucket, PDFs only, 10 MB each. Applicants upload into a folder
-- named after their own user id; files can't be changed or deleted by
-- clients once uploaded.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vendor-documents', 'vendor-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf'];

CREATE POLICY "Applicants upload their own seller documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Seller documents readable by uploader, boutique members and admins"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vendor-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.vendor_documents d
        WHERE d.file_path = storage.objects.name AND public.is_vendor_member(auth.uid(), d.vendor_id)
      )
    )
  );

-- ---------- checklist (mirrors src/lib/vendorKyc.ts) ----------

CREATE OR REPLACE FUNCTION public.vendor_required_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _constitution
    WHEN 'proprietorship' THEN ARRAY['pan_card', 'aadhaar_card', 'gst_certificate']
    WHEN 'partnership' THEN ARRAY['pan_card', 'gst_certificate', 'partnership_deed', 'rof_certificate', 'aadhaar_card']
    WHEN 'llp' THEN ARRAY['pan_card', 'gst_certificate', 'llp_incorporation', 'aadhaar_card']
    WHEN 'private_limited' THEN ARRAY['pan_card', 'gst_certificate', 'company_incorporation', 'aadhaar_card']
  END || ARRAY['bank_proof'];
$$;

CREATE OR REPLACE FUNCTION public.vendor_optional_documents(_constitution text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _constitution = 'proprietorship' THEN ARRAY['msme_certificate'] ELSE ARRAY[]::text[] END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_document_label(_doc_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _doc_type
    WHEN 'pan_card' THEN 'PAN card'
    WHEN 'aadhaar_card' THEN 'Aadhaar card'
    WHEN 'gst_certificate' THEN 'GST registration certificate'
    WHEN 'msme_certificate' THEN 'MSME certificate'
    WHEN 'partnership_deed' THEN 'Partnership deed'
    WHEN 'rof_certificate' THEN 'ROF (Register of Firms) certificate'
    WHEN 'llp_incorporation' THEN 'LLP incorporation document'
    WHEN 'company_incorporation' THEN 'Company incorporation document'
    WHEN 'bank_proof' THEN 'Bank proof'
    ELSE _doc_type
  END;
$$;

-- 10-digit Indian mobile (accepts +91 / 0 prefixes and spaces), or NULL.
CREATE OR REPLACE FUNCTION public.normalize_indian_mobile(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN d ~ '^[6-9][0-9]{9}$' THEN d END
  FROM (
    SELECT CASE
      WHEN length(x) = 12 AND x LIKE '91%' THEN substr(x, 3)
      WHEN length(x) = 11 AND x LIKE '0%' THEN substr(x, 2)
      ELSE x
    END AS d
    FROM (SELECT regexp_replace(coalesce(_raw, ''), '[^0-9]', '', 'g') AS x) s
  ) t;
$$;

-- ---------- submit ----------

CREATE OR REPLACE FUNCTION public.submit_vendor_application(_app jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email_re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  v_name text := btrim(coalesce(_app->>'name', ''));
  v_constitution text := _app->>'business_constitution';
  v_legal text := btrim(coalesce(_app->>'legal_business_name', ''));
  v_pan text := upper(btrim(coalesce(_app->>'pan', '')));
  v_gstin text := upper(btrim(coalesce(_app->>'gstin', '')));
  v_primary text := public.normalize_indian_mobile(_app->>'primary_mobile');
  v_alternate text := public.normalize_indian_mobile(_app->>'alternate_mobile');
  v_business_email text := lower(btrim(coalesce(_app->>'business_email', '')));
  v_auth jsonb := coalesce(_app->'authorized_person', '{}'::jsonb);
  v_auth_mobile text := public.normalize_indian_mobile(v_auth->>'mobile');
  v_same boolean := coalesce((_app->>'contact_same_as_authorized')::boolean, true);
  v_contact jsonb := coalesce(_app->'contact_person', '{}'::jsonb);
  v_contact_mobile text := public.normalize_indian_mobile(v_contact->>'mobile');
  v_bank jsonb := coalesce(_app->'bank', '{}'::jsonb);
  v_account text := regexp_replace(coalesce(v_bank->>'account_number', ''), '\s', '', 'g');
  v_ifsc text := upper(btrim(coalesce(v_bank->>'ifsc', '')));
  v_docs jsonb := coalesce(_app->'documents', '[]'::jsonb);
  v_doc jsonb;
  v_types text[] := ARRAY[]::text[];
  v_allowed text[];
  v_missing text[];
  v_base text;
  v_slug text;
  v_try integer := 0;
  v_vendor_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to apply.';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_members WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM vendors WHERE owner_user_id = v_uid) THEN
    RAISE EXCEPTION 'You already have a store application.';
  END IF;

  IF v_name = '' THEN RAISE EXCEPTION 'Enter your store name.'; END IF;
  IF v_constitution IS NULL OR v_constitution NOT IN ('proprietorship', 'partnership', 'llp', 'private_limited') THEN
    RAISE EXCEPTION 'Select your business constitution.';
  END IF;
  IF v_legal = '' THEN RAISE EXCEPTION 'Enter your legal business name.'; END IF;
  IF v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'Enter a valid PAN (e.g. ABCDE1234F).'; END IF;
  IF v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RAISE EXCEPTION 'Enter a valid 15-character GST number.';
  END IF;
  IF substr(v_gstin, 3, 10) <> v_pan THEN
    RAISE EXCEPTION 'The GST number doesn''t match the PAN (characters 3 to 12 of a GST number are the PAN).';
  END IF;
  IF v_primary IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit primary mobile number.'; END IF;
  IF v_alternate IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit alternative mobile number.'; END IF;
  IF v_alternate = v_primary THEN
    RAISE EXCEPTION 'The alternative mobile number must be different from the primary one.';
  END IF;
  IF v_business_email !~ v_email_re THEN RAISE EXCEPTION 'Enter a valid official business email address.'; END IF;

  IF btrim(coalesce(v_auth->>'name', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s full name.'; END IF;
  IF btrim(coalesce(v_auth->>'designation', '')) = '' THEN RAISE EXCEPTION 'Enter the authorized person''s designation.'; END IF;
  IF v_auth_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the authorized person.'; END IF;
  IF lower(btrim(coalesce(v_auth->>'email', ''))) !~ v_email_re THEN
    RAISE EXCEPTION 'Enter a valid email for the authorized person.';
  END IF;
  IF NOT v_same THEN
    IF btrim(coalesce(v_contact->>'name', '')) = '' OR btrim(coalesce(v_contact->>'designation', '')) = '' THEN
      RAISE EXCEPTION 'Enter the contact person''s name and designation.';
    END IF;
    IF v_contact_mobile IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the contact person.'; END IF;
    IF lower(btrim(coalesce(v_contact->>'email', ''))) !~ v_email_re THEN
      RAISE EXCEPTION 'Enter a valid email for the contact person.';
    END IF;
  END IF;

  IF btrim(coalesce(v_bank->>'account_holder_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank account holder name.'; END IF;
  IF v_account !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Enter a valid bank account number (9 to 18 digits).'; END IF;
  IF v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Enter a valid 11-character IFSC code.'; END IF;
  IF btrim(coalesce(v_bank->>'bank_name', '')) = '' THEN RAISE EXCEPTION 'Enter the bank name.'; END IF;
  IF coalesce(v_bank->>'proof_type', '') NOT IN ('cancelled_cheque', 'bank_letter', 'bank_statement') THEN
    RAISE EXCEPTION 'Choose the type of bank proof you are uploading.';
  END IF;

  -- Documents: only this constitution's types, each a PDF this applicant
  -- uploaded to their own folder.
  v_allowed := public.vendor_required_documents(v_constitution) || public.vendor_optional_documents(v_constitution);
  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF NOT (v_doc->>'doc_type' = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% isn''t needed for this business constitution.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF v_doc->>'doc_type' = ANY (v_types) THEN
      RAISE EXCEPTION 'Upload only one %.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    IF coalesce(v_doc->>'file_path', '') NOT LIKE v_uid::text || '/%'
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'vendor-documents' AND o.name = v_doc->>'file_path'
           AND o.metadata->>'mimetype' = 'application/pdf'
       ) THEN
      RAISE EXCEPTION 'The % upload wasn''t found - please upload it again as a PDF.', public.vendor_document_label(v_doc->>'doc_type');
    END IF;
    v_types := v_types || (v_doc->>'doc_type');
  END LOOP;
  SELECT array_agg(public.vendor_document_label(t)) INTO v_missing
  FROM unnest(public.vendor_required_documents(v_constitution)) AS t
  WHERE NOT (t = ANY (v_types));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Please upload: %.', array_to_string(v_missing, ', ');
  END IF;

  -- Unique storefront slug.
  v_base := nullif(trim(BOTH '-' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), '');
  v_base := coalesce(v_base, 'store-' || substr(md5(random()::text), 1, 6));
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM vendors WHERE slug = v_slug) LOOP
    v_try := v_try + 1;
    v_slug := v_base || '-' || v_try;
  END LOOP;

  INSERT INTO vendors (
    owner_user_id, name, slug, description, contact_email, contact_phone, gst_number, address,
    shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy,
    status, commission_rate, payout_account_status, rating
  ) VALUES (
    v_uid, v_name, v_slug, nullif(btrim(coalesce(_app->>'description', '')), ''), v_business_email, v_primary, v_gstin,
    coalesce(_app->'address', '{}'::jsonb),
    coalesce((_app->>'shipping_flat_rate')::numeric, 0),
    nullif(_app->>'free_shipping_threshold', '')::numeric,
    coalesce((_app->>'return_window_days')::integer, 7),
    nullif(btrim(coalesce(_app->>'return_policy', '')), ''),
    'pending', 10, 'not_setup', 0
  )
  RETURNING id INTO v_vendor_id;

  INSERT INTO vendor_members (user_id, vendor_id, role) VALUES (v_uid, v_vendor_id, 'owner');

  INSERT INTO vendor_kyc (
    vendor_id, business_constitution, legal_business_name, pan, gstin, primary_mobile, alternate_mobile,
    business_email, authorized_name, authorized_designation, authorized_mobile, authorized_email,
    contact_same_as_authorized, contact_name, contact_designation, contact_mobile, contact_email, bank_proof_type
  ) VALUES (
    v_vendor_id, v_constitution, v_legal, v_pan, v_gstin, v_primary, v_alternate,
    v_business_email, btrim(v_auth->>'name'), btrim(v_auth->>'designation'), v_auth_mobile, lower(btrim(v_auth->>'email')),
    v_same,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'name') END,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'designation') END,
    CASE WHEN v_same THEN NULL ELSE v_contact_mobile END,
    CASE WHEN v_same THEN NULL ELSE lower(btrim(v_contact->>'email')) END,
    v_bank->>'proof_type'
  );

  INSERT INTO vendor_documents (vendor_id, doc_type, file_path, file_name, file_size, uploaded_by)
  SELECT v_vendor_id, d->>'doc_type', d->>'file_path', coalesce(nullif(d->>'file_name', ''), 'document.pdf'),
         nullif(d->>'file_size', '')::integer, v_uid
  FROM jsonb_array_elements(v_docs) AS d;

  -- Same table the Payouts tab and Razorpay onboarding use.
  INSERT INTO vendor_payout_accounts (
    vendor_id, account_holder_name, bank_account_number, bank_ifsc, bank_name, business_type, pan, legal_business_name
  ) VALUES (
    v_vendor_id, btrim(v_bank->>'account_holder_name'), v_account, v_ifsc, btrim(v_bank->>'bank_name'),
    v_constitution, v_pan, v_legal
  );

  PERFORM public.notify_admins('other', 'vendor_application', 'New boutique application',
    format('%s (%s) applied to sell on AllBoutiqs.', v_name, replace(initcap(replace(v_constitution, '_', ' ')), 'Llp', 'LLP')),
    '/admin?tab=vendors&sub=applications');

  RETURN v_vendor_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_vendor_application(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(jsonb) TO authenticated;

-- Bank details arriving with an application aren't a "your payout account
-- changed" event - stay quiet until the boutique is approved.
CREATE OR REPLACE FUNCTION public.vendor_payout_account_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 text := right(regexp_replace(NEW.bank_account_number, '\s', '', 'g'), 4);
  v_name text;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.bank_account_number IS NOT DISTINCT FROM OLD.bank_account_number
     AND NEW.bank_ifsc IS NOT DISTINCT FROM OLD.bank_ifsc
     AND NEW.account_holder_name IS NOT DISTINCT FROM OLD.account_holder_name THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.vendors WHERE id = NEW.vendor_id;

  UPDATE public.vendors SET payout_account_status = 'pending'
  WHERE id = NEW.vendor_id AND payout_account_status <> 'disabled'
  RETURNING name INTO v_name;

  IF v_status = 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_vendor_members(NEW.vendor_id, 'payout_account_updated', 'Payout bank details updated',
    format('Payouts will now go to %s, account ending %s (IFSC %s). If you didn''t make this change, contact AllBoutiqs immediately.',
           NEW.account_holder_name, v_last4, NEW.bank_ifsc),
    public.vendor_payout_account_link());
  PERFORM public.notify_admins('other', 'payout_account_updated', 'Boutique bank details changed',
    format('%s %s payout bank details (account ending %s).',
           coalesce(v_name, 'A boutique'), CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'changed' END, v_last4),
    public.nlink('/admin', 'vendor-payouts'));
  PERFORM public.invoke_edge_function('send-vendor-payout-email',
    jsonb_build_object('event', 'account_updated', 'vendor_id', NEW.vendor_id));
  RETURN NEW;
END;
$$;

-- ---------- close direct paths around the checks ----------

-- Applications now go through submit_vendor_application (admins keep their
-- own "manage all vendors" policy, e.g. CSV import).
DROP POLICY IF EXISTS "Users can apply to become a vendor" ON public.vendors;

-- Previously any signed-in user could add themselves to ANY boutique
-- (user_id = auth.uid() was enough) and then read its orders, payouts and
-- bank details. Owners are now added by submit_vendor_application; only
-- admins or existing members of that boutique can add members.
DROP POLICY IF EXISTS "Users can create their own membership" ON public.vendor_members;
CREATE POLICY "Admins and existing members add members"
  ON public.vendor_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_vendor_member(auth.uid(), vendor_id));
