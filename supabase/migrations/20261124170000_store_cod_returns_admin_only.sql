-- Store-level "Offer Cash on Delivery" and "Accept returns" are AllBoutiqs'
-- switches only (client corrections Part 2, A19.2): both are set per product
-- (products.cod_available / is_returnable), and the boutique's Store settings
-- no longer show them. A boutique's own session can't change
-- vendors.cod_enabled / returns_enabled any more - only an admin (Admin >
-- Vendors > boutique details) or the server. Checkout, the product page and
-- My orders still read them. No data changes: every boutique has both on.

CREATE OR REPLACE FUNCTION public.protect_vendor_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_privileged_writer() THEN
      NEW.is_trusted := false;
      NEW.is_verified := false;
      NEW.commission_rate := NULL;
      NEW.is_founding := false;
      NEW.founding_from := NULL;
      NEW.founding_until := NULL;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.cod_enabled := true;
      NEW.returns_enabled := true;
    END IF;
    RETURN NEW;
  END IF;

  NEW.boutique_code := OLD.boutique_code;

  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  NEW.is_trusted := OLD.is_trusted;
  NEW.is_verified := OLD.is_verified;
  NEW.status := OLD.status;
  NEW.commission_rate := OLD.commission_rate;
  NEW.is_founding := OLD.is_founding;
  NEW.founding_from := OLD.founding_from;
  NEW.founding_until := OLD.founding_until;
  NEW.approved_by := OLD.approved_by;
  NEW.approved_at := OLD.approved_at;
  NEW.owner_user_id := OLD.owner_user_id;
  -- Store-level Cash on Delivery / returns: AllBoutiqs only (A19.2).
  NEW.cod_enabled := OLD.cod_enabled;
  NEW.returns_enabled := OLD.returns_enabled;

  IF NEW.payout_account_status <> 'pending' THEN
    NEW.payout_account_status := OLD.payout_account_status;
  END IF;

  RETURN NEW;
END;
$$;
