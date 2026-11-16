-- Delivery address line 1: at least 10 characters, spaces at either end not
-- counted (client corrections, 15 Nov 2026, point 2.9.3, "common piece D").
-- The checkout and My Account forms already hold it (AddressLine1Input,
-- src/lib/addressLine1.ts, ADDRESS_LINE1_MIN = 10); until now the database
-- took any address, so a browser could still save a shorter one. This
-- makes the server refuse it too.
--
-- Only rows written from a browser (anon / authenticated) are checked:
-- edge functions and admin tools on the service role are left alone. A
-- saved address is checked when line 1 is new or changed, so an older
-- short one can still be made the default or deleted. (Live on 16 Nov:
-- 1 saved address and 1 order, both long enough.)

CREATE OR REPLACE FUNCTION public.address_line1_long_enough(_line1 text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT char_length(regexp_replace(coalesce(_line1, ''), '^\s+|\s+$', '', 'g')) >= 10;
$$;

CREATE OR REPLACE FUNCTION public.guard_order_address_line1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND NOT public.address_line1_long_enough(NEW.shipping_address ->> 'address_line1') THEN
    RAISE EXCEPTION 'Address line 1 needs at least 10 characters'
      USING ERRCODE = 'check_violation',
            HINT = 'Shop / building no., street, area (needed by our courier partner).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_order_address_line1_trigger ON public.orders;
CREATE TRIGGER guard_order_address_line1_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_address_line1();

CREATE OR REPLACE FUNCTION public.guard_saved_address_line1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND (TG_OP = 'INSERT' OR NEW.address_line_1 IS DISTINCT FROM OLD.address_line_1)
     AND NOT public.address_line1_long_enough(NEW.address_line_1) THEN
    RAISE EXCEPTION 'Address line 1 needs at least 10 characters'
      USING ERRCODE = 'check_violation',
            HINT = 'Shop / building no., street, area (needed by our courier partner).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_saved_address_line1_trigger ON public.saved_addresses;
CREATE TRIGGER guard_saved_address_line1_trigger
  BEFORE INSERT OR UPDATE ON public.saved_addresses
  FOR EACH ROW EXECUTE FUNCTION public.guard_saved_address_line1();
