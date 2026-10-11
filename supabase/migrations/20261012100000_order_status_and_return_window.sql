-- Two business rules, for direct and warehouse orders alike:
--
-- 1. The whole order's status follows its boutique parts automatically (it
--    used to stay "pending" forever unless an admin changed it by hand, so
--    customers never saw the Return / Exchange button, the admin Orders tabs
--    and the dashboard's pending count were wrong). Admin can still change it
--    by hand for an exception; the next change to a part re-derives it.
--
-- 2. A part can be returned or exchanged once THAT part is delivered, until
--    its boutique's return window ends (delivery date + return_window_days).
--    Enforced here, not only in the app: boutique payouts are released after
--    the same window, so a late return would otherwise come after the boutique
--    was already paid. An admin can extend one part's window for an exception.

-- ---------------------------------------------------------------------------
-- 1. Whole-order status
-- ---------------------------------------------------------------------------

-- all cancelled                      -> cancelled
-- all delivered (or cancelled)       -> delivered
-- any part with the courier/customer -> shipped
-- any part being prepared/at warehouse -> processing
-- any part confirmed                 -> confirmed
-- otherwise                          -> pending
CREATE OR REPLACE FUNCTION public.derive_order_status(_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN count(*) = 0 THEN NULL
    WHEN bool_and(status = 'cancelled') THEN 'cancelled'
    WHEN bool_and(status IN ('delivered', 'cancelled')) THEN 'delivered'
    WHEN bool_or(status IN ('shipped', 'out_for_delivery', 'ndr', 'delivered', 'returned')) THEN 'shipped'
    WHEN bool_or(status IN ('processing', 'in_transit_to_warehouse', 'at_warehouse', 'qc_failed')) THEN 'processing'
    WHEN bool_or(status = 'confirmed') THEN 'confirmed'
    ELSE 'pending'
  END
  FROM public.vendor_orders
  WHERE order_id = _order_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_status_from_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  v_status := public.derive_order_status(NEW.order_id);
  IF v_status IS NOT NULL THEN
    UPDATE public.orders
    SET order_status = v_status
    WHERE id = NEW.order_id AND order_status IS DISTINCT FROM v_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_status_from_parts_trigger ON public.vendor_orders;
CREATE TRIGGER sync_order_status_from_parts_trigger
  AFTER INSERT OR UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_from_parts();

-- ---------------------------------------------------------------------------
-- 2. Return window per boutique part
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS return_window_ends_on date;

-- Set once, when the part is delivered to the customer. (Runs before
-- stamp_vendor_order_delivery_trigger - BEFORE triggers fire in name order -
-- so delivered_at may not be stamped yet.)
CREATE OR REPLACE FUNCTION public.set_return_window_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.return_window_ends_on IS NULL THEN
    SELECT coalesce(return_window_days, 7) INTO v_days FROM public.vendors WHERE id = NEW.vendor_id;
    NEW.return_window_ends_on :=
      (coalesce(NEW.delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date + coalesce(v_days, 7);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_return_window_on_delivery_trigger ON public.vendor_orders;
CREATE TRIGGER set_return_window_on_delivery_trigger
  BEFORE UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_return_window_on_delivery();

-- Only an admin (or the server) may move a window - boutiques can update
-- their own vendor_orders and must not shorten it. Named to fire before
-- set_return_window_on_delivery_trigger, which sets it on delivery.
CREATE OR REPLACE FUNCTION public.guard_vendor_order_return_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
     AND current_user::text IN ('anon', 'authenticated')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only the AllBoutiqs team can change a return window';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_order_return_window_trigger ON public.vendor_orders;
CREATE TRIGGER guard_vendor_order_return_window_trigger
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_order_return_window();

-- A customer's return/exchange request: every item must be delivered and
-- inside its window. Admins and the server aren't limited.
CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, vo.id AS vendor_order_id, vo.status, vo.return_window_ends_on
    FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS e
    JOIN public.order_items oi ON oi.id::text = e->>'order_item_id'
    LEFT JOIN public.vendor_orders vo ON vo.id = oi.vendor_order_id
  LOOP
    -- Items not sold by a boutique have no delivery tracking to check.
    CONTINUE WHEN r.vendor_order_id IS NULL;
    IF r.status IS DISTINCT FROM 'delivered' THEN
      RAISE EXCEPTION '"%" hasn''t been delivered yet, so it can''t be returned or exchanged.', r.product_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF r.return_window_ends_on IS NOT NULL AND v_today > r.return_window_ends_on THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title, to_char(r.return_window_ends_on, 'DD Mon YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_return_window_trigger ON public.return_requests;
CREATE TRIGGER enforce_return_window_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_return_window();

-- ---------------------------------------------------------------------------
-- 3. Existing orders
-- ---------------------------------------------------------------------------

UPDATE public.vendor_orders vo
SET return_window_ends_on =
  (coalesce(vo.delivered_at, vo.updated_at) AT TIME ZONE 'Asia/Kolkata')::date + coalesce(v.return_window_days, 7)
FROM public.vendors v
WHERE v.id = vo.vendor_id AND vo.status = 'delivered' AND vo.return_window_ends_on IS NULL;

UPDATE public.orders o
SET order_status = public.derive_order_status(o.id)
WHERE public.derive_order_status(o.id) IS NOT NULL
  AND o.order_status IS DISTINCT FROM public.derive_order_status(o.id);
