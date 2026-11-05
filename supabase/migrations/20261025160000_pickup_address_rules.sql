-- Extra list from the client (F): Shiprocket refuses a pickup location whose
-- address line 1 or state is only a few letters, so the booking fails long
-- after the address was saved. A boutique's address (registration, Store
-- settings, admin edits) and the warehouse's are now checked when saved -
-- the same rules as src/lib/pickupAddress.ts:
--   address line 1 at least 10 characters; lines 1 + 2 at most 190;
--   city at least 3 letters; a real Indian state; a 6-digit PIN code.
-- An address not filled in yet (empty) is still allowed - it just can't be
-- used to ship until it is. Rows saved before this aren't re-checked until
-- their address changes.

CREATE OR REPLACE FUNCTION public.pickup_address_problem(_addr jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_line1 text := btrim(coalesce(_addr->>'address_line1', ''));
  v_line2 text := btrim(coalesce(_addr->>'address_line2', ''));
  v_city text := btrim(coalesce(_addr->>'city', ''));
  v_state text := btrim(coalesce(_addr->>'state', ''));
  v_pin text := btrim(coalesce(_addr->>'pincode', ''));
BEGIN
  IF v_line1 = '' AND v_line2 = '' AND v_city = '' AND v_state = '' AND v_pin = '' THEN
    RETURN NULL;
  END IF;
  IF length(v_line1) < 10 THEN
    RETURN 'Address line 1 needs at least 10 characters - shop / building number, street and area.';
  END IF;
  IF length(v_line1) + length(v_line2) > 190 THEN
    RETURN 'Address lines 1 and 2 together can have at most 190 characters.';
  END IF;
  IF length(v_city) < 3 OR v_city !~ '^[A-Za-z][A-Za-z .''-]*$' THEN
    RETURN 'Enter the full city name (letters only).';
  END IF;
  IF public.gst_state_code(v_state) IS NULL THEN
    RETURN 'Select a valid Indian state.';
  END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN
    RETURN 'Enter a valid 6-digit PIN code.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_pickup_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_problem text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.address IS NOT DISTINCT FROM OLD.address THEN
    RETURN NEW;
  END IF;
  v_problem := public.pickup_address_problem(coalesce(NEW.address, '{}'::jsonb));
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'Pickup address: %', v_problem USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_pickup_address_trigger ON public.vendors;
CREATE TRIGGER check_pickup_address_trigger
  BEFORE INSERT OR UPDATE OF address ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.check_pickup_address();

DROP TRIGGER IF EXISTS check_pickup_address_trigger ON public.warehouses;
CREATE TRIGGER check_pickup_address_trigger
  BEFORE INSERT OR UPDATE OF address ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.check_pickup_address();
