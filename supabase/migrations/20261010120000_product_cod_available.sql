-- Cash on Delivery per product: the boutique sets it when listing, admins
-- can change it on any product. A checkout can use COD only if every
-- product in it allows COD and every boutique has COD switched on
-- (vendors.cod_enabled). Checkout hides the option; this enforces it for
-- the order lines a customer writes, so it can't be bypassed.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cod_available boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.enforce_cod_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
  v_cod_available boolean;
  v_vendor_cod boolean;
  v_vendor_name text;
BEGIN
  -- Server-side writers (service role, admins) are trusted.
  IF public.is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  SELECT payment_method INTO v_method FROM public.orders WHERE id = NEW.order_id;
  IF v_method IS DISTINCT FROM 'cod' THEN
    RETURN NEW;
  END IF;

  SELECT p.cod_available, v.cod_enabled, v.name
  INTO v_cod_available, v_vendor_cod, v_vendor_name
  FROM public.products p
  LEFT JOIN public.vendors v ON v.id = p.vendor_id
  WHERE p.id = NEW.product_id;

  IF v_cod_available IS FALSE THEN
    RAISE EXCEPTION 'Cash on Delivery isn''t available for "%". Please pay online.', NEW.product_title
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_vendor_cod IS FALSE THEN
    RAISE EXCEPTION '% doesn''t offer Cash on Delivery. Please pay online.', coalesce(v_vendor_name, 'This boutique')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_cod_availability_trigger ON public.order_items;
CREATE TRIGGER enforce_cod_availability_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cod_availability();
