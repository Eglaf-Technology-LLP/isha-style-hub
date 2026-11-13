-- One boutique per PAN, GST number, primary mobile, official business email,
-- bank account number, Instagram profile and website (when one is given)
-- (client, 13 Nov 2026).
--
-- The forms (registration, Store settings, Bank details, Admin > Vendors >
-- Details) ask vendor_identity_taken() before saving and show "already used"
-- under every such field at once. The triggers below stop a duplicate coming
-- in any other way.
--
-- Only a new or changed value is checked: boutiques that already share a
-- value (test data, to be deleted) can still save their other details.

-- The same value however it was typed: PAN / GSTIN in capitals, the
-- 10-digit mobile, the email in lower case, the account number without
-- spaces, the Instagram profile link, the website without http(s)://, www.
-- or a trailing slash.
CREATE OR REPLACE FUNCTION public.vendor_identity_key(_field text, _raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(CASE _field
    WHEN 'pan' THEN upper(regexp_replace(coalesce(_raw, ''), '\s', '', 'g'))
    WHEN 'gstin' THEN upper(regexp_replace(coalesce(_raw, ''), '\s', '', 'g'))
    WHEN 'primary_mobile' THEN public.normalize_indian_mobile(_raw)
    WHEN 'business_email' THEN lower(btrim(coalesce(_raw, '')))
    WHEN 'bank_account' THEN regexp_replace(coalesce(_raw, ''), '\s', '', 'g')
    WHEN 'instagram_url' THEN public.normalize_instagram_profile(_raw)
    WHEN 'website_url' THEN rtrim(regexp_replace(lower(btrim(coalesce(_raw, ''))), '^(https?://)?(www\.)?', ''), '/')
  END, '');
$$;

-- Which of _values ({field: value}) another boutique already has. A boutique
-- keeps its own values in several places (vendors, vendor_kyc,
-- vendor_payout_accounts); all of them count.
CREATE OR REPLACE FUNCTION public.vendor_identity_conflicts(_values jsonb, _vendor_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH used(field, vendor_id, key) AS (
    SELECT 'pan', vendor_id, vendor_identity_key('pan', pan) FROM vendor_kyc
    UNION ALL SELECT 'pan', id, vendor_identity_key('pan', pan_number) FROM vendors
    UNION ALL SELECT 'pan', vendor_id, vendor_identity_key('pan', pan) FROM vendor_payout_accounts
    UNION ALL SELECT 'gstin', vendor_id, vendor_identity_key('gstin', gstin) FROM vendor_kyc
    UNION ALL SELECT 'gstin', id, vendor_identity_key('gstin', gst_number) FROM vendors
    UNION ALL SELECT 'primary_mobile', vendor_id, vendor_identity_key('primary_mobile', primary_mobile) FROM vendor_kyc
    UNION ALL SELECT 'primary_mobile', id, vendor_identity_key('primary_mobile', contact_phone) FROM vendors
    UNION ALL SELECT 'business_email', vendor_id, vendor_identity_key('business_email', business_email) FROM vendor_kyc
    UNION ALL SELECT 'business_email', id, vendor_identity_key('business_email', contact_email) FROM vendors
    UNION ALL SELECT 'bank_account', vendor_id, vendor_identity_key('bank_account', bank_account_number) FROM vendor_payout_accounts
    UNION ALL SELECT 'instagram_url', vendor_id, vendor_identity_key('instagram_url', instagram_url) FROM vendor_kyc
    UNION ALL SELECT 'website_url', vendor_id, vendor_identity_key('website_url', website_url) FROM vendor_kyc
  )
  SELECT coalesce(array_agg(v.key ORDER BY v.key), '{}')
  FROM jsonb_each_text(coalesce(_values, '{}'::jsonb)) AS v
  WHERE vendor_identity_key(v.key, v.value) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM used u
      WHERE u.field = v.key
        AND u.key = vendor_identity_key(v.key, v.value)
        AND u.vendor_id IS DISTINCT FROM _vendor_id
    );
$$;

REVOKE ALL ON FUNCTION public.vendor_identity_conflicts(jsonb, uuid) FROM public, anon, authenticated;

-- For the forms. _vendor_id is the boutique being edited (its own values
-- don't count); only its members or an admin may pass it, so nobody can find
-- out which boutique a value belongs to. Answers only which fields are taken.
CREATE OR REPLACE FUNCTION public.vendor_identity_taken(_values jsonb, _vendor_id uuid DEFAULT NULL)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.';
  END IF;
  IF _vendor_id IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT EXISTS (SELECT 1 FROM vendor_members WHERE vendor_id = _vendor_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not your boutique.';
  END IF;
  RETURN public.vendor_identity_conflicts(_values, _vendor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_identity_taken(jsonb, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_identity_taken(jsonb, uuid) TO authenticated;

-- The safety net: a new or changed value another boutique has is refused,
-- naming the fields. DETAIL lists the field keys.
CREATE OR REPLACE FUNCTION public.enforce_unique_vendor_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_columns jsonb := CASE TG_TABLE_NAME
    WHEN 'vendors' THEN
      '{"pan_number": "pan", "gst_number": "gstin", "contact_phone": "primary_mobile", "contact_email": "business_email"}'
    WHEN 'vendor_kyc' THEN
      '{"pan": "pan", "gstin": "gstin", "primary_mobile": "primary_mobile", "business_email": "business_email", "instagram_url": "instagram_url", "website_url": "website_url"}'
    ELSE '{"pan": "pan", "bank_account_number": "bank_account"}'
  END::jsonb;
  v_values jsonb := '{}'::jsonb;
  v_column text;
  v_field text;
  v_taken text[];
BEGIN
  -- An upsert (Bank details) fires the INSERT trigger first: compare with the
  -- boutique's row that is already there, so only real changes are checked.
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'vendors' THEN
    EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE vendor_id = $1 LIMIT 1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
      INTO v_old USING NEW.vendor_id;
  END IF;

  FOR v_column, v_field IN SELECT key, value FROM jsonb_each_text(v_columns) LOOP
    IF v_old IS NULL
       OR vendor_identity_key(v_field, v_new->>v_column) IS DISTINCT FROM vendor_identity_key(v_field, v_old->>v_column) THEN
      v_values := v_values || jsonb_build_object(v_field, v_new->>v_column);
    END IF;
  END LOOP;
  IF v_values = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_taken := vendor_identity_conflicts(
    v_values,
    (v_new->>CASE WHEN TG_TABLE_NAME = 'vendors' THEN 'id' ELSE 'vendor_id' END)::uuid
  );
  IF cardinality(v_taken) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'unique_violation',
      MESSAGE = 'Already used by another boutique: ' || (
        SELECT string_agg(CASE t
          WHEN 'pan' THEN 'PAN'
          WHEN 'gstin' THEN 'GST number'
          WHEN 'primary_mobile' THEN 'mobile number'
          WHEN 'business_email' THEN 'business email'
          WHEN 'bank_account' THEN 'bank account number'
          WHEN 'instagram_url' THEN 'Instagram profile'
          WHEN 'website_url' THEN 'website'
        END, ', ')
        FROM unnest(v_taken) AS t
      ) || '.',
      DETAIL = array_to_string(v_taken, ',');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendors_unique_identity ON public.vendors;
CREATE TRIGGER vendors_unique_identity
  BEFORE INSERT OR UPDATE OF pan_number, gst_number, contact_phone, contact_email ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_vendor_identity();

DROP TRIGGER IF EXISTS vendor_kyc_unique_identity ON public.vendor_kyc;
CREATE TRIGGER vendor_kyc_unique_identity
  BEFORE INSERT OR UPDATE OF pan, gstin, primary_mobile, business_email, instagram_url, website_url ON public.vendor_kyc
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_vendor_identity();

DROP TRIGGER IF EXISTS vendor_payout_accounts_unique_identity ON public.vendor_payout_accounts;
CREATE TRIGGER vendor_payout_accounts_unique_identity
  BEFORE INSERT OR UPDATE OF pan, bank_account_number ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_vendor_identity();
