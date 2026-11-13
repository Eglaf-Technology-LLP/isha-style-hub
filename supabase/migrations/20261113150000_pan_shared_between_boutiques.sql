-- PAN may be shared (client, 13 Nov 2026): one PAN can have several GST
-- numbers - outlets in different States, or separate registrations in one
-- State - and each GST number is a separate boutique. So PAN is no longer
-- one-boutique-only; GST number, primary mobile, business email, bank account,
-- Instagram profile and website still are (20261113130000). No admin warning
-- for a shared PAN.
--
-- The refusal now reads "This ... is already registered with AllBoutiqs.
-- Please contact support@allboutiqs.com.", and a new boutique whose GST
-- number is already here gets "You are already registered with AllBoutiqs.
-- Please contact support@allboutiqs.com." - the same words as the forms.
-- The triggers still fire on PAN columns; PAN just never conflicts now.
-- Changes no data.

CREATE OR REPLACE FUNCTION public.vendor_identity_conflicts(_values jsonb, _vendor_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH used(field, vendor_id, key) AS (
    SELECT 'gstin', vendor_id, vendor_identity_key('gstin', gstin) FROM vendor_kyc
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
      '{"gst_number": "gstin", "contact_phone": "primary_mobile", "contact_email": "business_email"}'
    WHEN 'vendor_kyc' THEN
      '{"gstin": "gstin", "primary_mobile": "primary_mobile", "business_email": "business_email", "instagram_url": "instagram_url", "website_url": "website_url"}'
    ELSE '{"bank_account_number": "bank_account"}'
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
      MESSAGE = CASE
        -- A new boutique whose GST number is already here: the same seller again.
        WHEN v_old IS NULL AND TG_OP = 'INSERT' AND 'gstin' = ANY (v_taken)
          THEN 'You are already registered with AllBoutiqs. Please contact support@allboutiqs.com.'
        ELSE 'This ' || (
          SELECT string_agg(CASE t
            WHEN 'gstin' THEN 'GST number'
            WHEN 'primary_mobile' THEN 'mobile number'
            WHEN 'business_email' THEN 'email address'
            WHEN 'bank_account' THEN 'bank account number'
            WHEN 'instagram_url' THEN 'Instagram profile'
            WHEN 'website_url' THEN 'website'
          END, ', ')
          FROM unnest(v_taken) AS t
        ) || ' is already registered with AllBoutiqs. Please contact support@allboutiqs.com.'
      END,
      DETAIL = array_to_string(v_taken, ',');
  END IF;
  RETURN NEW;
END;
$$;
