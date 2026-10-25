-- Extra list from the client (E): seller sign-up asks the seller to accept
-- the Privacy Policy and the Seller Terms & Conditions (required - the
-- pages are /privacy-policy and /seller-terms) and whether they want
-- promotional emails from AllBoutiqs (optional). Kept with the seller's
-- private KYC record: when they accepted, which version of the terms, and
-- their promotional-email choice and when it was made.
ALTER TABLE public.vendor_kyc
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS marketing_emails_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;

CREATE OR REPLACE FUNCTION public.submit_vendor_application(_app jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email_re text := '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  v_name text := btrim(coalesce(_app->>'name', ''));
  v_constitution text := _app->>'business_constitution';
  v_brand_same boolean := coalesce((_app->>'brand_same_as_legal')::boolean, true);
  v_declared boolean := coalesce((_app->>'brand_legal_declaration')::boolean, false);
  v_legal text := btrim(coalesce(_app->>'legal_business_name', ''));
  v_instagram text := public.normalize_instagram_profile(_app->>'instagram_url');
  v_website_raw text := btrim(coalesce(_app->>'website_url', ''));
  v_website text;
  v_addr jsonb := coalesce(_app->'address', '{}'::jsonb);
  v_line1 text := btrim(coalesce(v_addr->>'address_line1', ''));
  v_city text := btrim(coalesce(v_addr->>'city', ''));
  v_state text := btrim(coalesce(v_addr->>'state', ''));
  v_pin text := btrim(coalesce(v_addr->>'pincode', ''));
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

  IF v_name = '' THEN RAISE EXCEPTION 'Enter your Boutique / Brand Name.'; END IF;
  IF v_brand_same THEN
    v_legal := v_name;
  ELSE
    IF v_legal = '' THEN RAISE EXCEPTION 'Enter your Legal Business Name (as on GST / PAN).'; END IF;
    IF NOT v_declared THEN
      RAISE EXCEPTION 'Tick the declaration that your Boutique / Brand Name belongs to your Legal Business Name.';
    END IF;
  END IF;
  IF v_instagram IS NULL THEN
    RAISE EXCEPTION 'Enter your Instagram profile link (e.g. https://www.instagram.com/yourboutique).';
  END IF;
  IF v_website_raw <> '' THEN
    v_website := public.normalize_website_url(v_website_raw);
    IF v_website IS NULL THEN RAISE EXCEPTION 'Enter a valid website link, or leave it empty.'; END IF;
  END IF;
  IF v_constitution IS NULL OR v_constitution NOT IN ('proprietorship', 'partnership', 'llp', 'private_limited', 'huf') THEN
    RAISE EXCEPTION 'Select your business type.';
  END IF;
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

  -- Business address = courier pickup address (Shiprocket rejects short
  -- address lines).
  IF length(v_line1) < 10 THEN RAISE EXCEPTION 'Address line 1 needs at least 10 characters.'; END IF;
  IF v_city = '' THEN RAISE EXCEPTION 'Enter your city.'; END IF;
  IF v_state = '' THEN RAISE EXCEPTION 'Select your state.'; END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN RAISE EXCEPTION 'Enter a valid 6-digit PIN code.'; END IF;

  -- Privacy Policy and Seller Terms must be accepted; promotional emails
  -- are the seller's choice (Extra list E).
  IF NOT coalesce((_app->>'accepted_terms')::boolean, false) THEN
    RAISE EXCEPTION 'Please accept the Privacy Policy and the Seller Terms & Conditions.';
  END IF;

  -- Documents: only this business type's, each a PDF this applicant
  -- uploaded to their own folder.
  v_allowed := public.vendor_required_documents(v_constitution) || public.vendor_optional_documents(v_constitution);
  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF NOT (v_doc->>'doc_type' = ANY (v_allowed)) THEN
      RAISE EXCEPTION '% isn''t needed for this business type.', public.vendor_document_label(v_doc->>'doc_type');
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
    jsonb_build_object(
      'address_line1', v_line1,
      'address_line2', btrim(coalesce(v_addr->>'address_line2', '')),
      'city', v_city,
      'state', v_state,
      'pincode', v_pin,
      'country', 'India'
    ),
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
    contact_same_as_authorized, contact_name, contact_designation, contact_mobile, contact_email, bank_proof_type,
    brand_same_as_legal, brand_legal_declared_at, instagram_url, website_url,
    terms_accepted_at, terms_version, marketing_emails_opt_in, marketing_consent_at
  ) VALUES (
    v_vendor_id, v_constitution, v_legal, v_pan, v_gstin, v_primary, v_alternate,
    v_business_email, btrim(v_auth->>'name'), btrim(v_auth->>'designation'), v_auth_mobile, lower(btrim(v_auth->>'email')),
    v_same,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'name') END,
    CASE WHEN v_same THEN NULL ELSE btrim(v_contact->>'designation') END,
    CASE WHEN v_same THEN NULL ELSE v_contact_mobile END,
    CASE WHEN v_same THEN NULL ELSE lower(btrim(v_contact->>'email')) END,
    v_bank->>'proof_type',
    v_brand_same, CASE WHEN v_brand_same THEN NULL ELSE now() END, v_instagram, v_website,
    now(), nullif(btrim(coalesce(_app->>'terms_version', '')), ''),
    coalesce((_app->>'marketing_emails')::boolean, false), now()
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
    format('%s (%s) applied to sell on AllBoutiqs.', v_name,
           replace(replace(initcap(replace(v_constitution, '_', ' ')), 'Llp', 'LLP'), 'Huf', 'HUF')),
    '/admin?tab=vendors&sub=applications');

  RETURN v_vendor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_vendor_application(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(jsonb) TO authenticated;
