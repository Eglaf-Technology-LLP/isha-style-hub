-- 24-hour cancel and return windows (user, 2 Nov 2026), for every product:
-- * a customer can cancel an order only within 24 hours of placing it
--   (enforced in cancel-order-items; boutiques and admins still can);
-- * a return or exchange can be asked for only within 24 hours of delivery.
--   A customised piece follows the same window and, as before, only for a
--   damaged or wrong item, and never as an exchange.
-- Both are admin settings (hours). The boutiques' own return_window_days no
-- longer sets the window; an admin can still move a part's window.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS customer_cancel_hours integer NOT NULL DEFAULT 24
    CHECK (customer_cancel_hours BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS return_window_hours integer NOT NULL DEFAULT 24
    CHECK (return_window_hours BETWEEN 1 AND 720);

-- The exact end of the window; return_window_ends_on (its day in India)
-- stays for the payout date and the lists.
ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS return_window_ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_return_window_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.return_window_ends_on IS NULL THEN
    SELECT return_window_hours INTO v_hours FROM public.platform_settings LIMIT 1;
    NEW.return_window_ends_at := coalesce(NEW.delivered_at, now()) + make_interval(hours => coalesce(v_hours, 24));
    NEW.return_window_ends_on := (NEW.return_window_ends_at AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  RETURN NEW;
END;
$$;

-- Only an admin (or the server) may move a window - boutiques can update
-- their own vendor_orders and must not shorten it. Now covers the exact end.
CREATE OR REPLACE FUNCTION public.guard_vendor_order_return_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
      OR NEW.return_window_ends_at IS DISTINCT FROM OLD.return_window_ends_at)
     AND current_user::text IN ('anon', 'authenticated')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only the AllBoutiqs team can change a return window';
  END IF;
  RETURN NEW;
END;
$$;

-- An admin moving a part's window (by the day) moves its exact end to the
-- end of that day in India.
CREATE OR REPLACE FUNCTION public.sync_return_window_ends_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.return_window_ends_on IS DISTINCT FROM OLD.return_window_ends_on
     AND NEW.return_window_ends_at IS NOT DISTINCT FROM OLD.return_window_ends_at THEN
    NEW.return_window_ends_at :=
      CASE WHEN NEW.return_window_ends_on IS NULL THEN NULL
           ELSE ((NEW.return_window_ends_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_return_window_ends_at_trigger ON public.vendor_orders;
CREATE TRIGGER sync_return_window_ends_at_trigger
  BEFORE UPDATE OF return_window_ends_on ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_return_window_ends_at();

-- A customer's return/exchange request: every item delivered and inside its
-- part's window; customised pieces only for a damaged or wrong item.
CREATE OR REPLACE FUNCTION public.enforce_return_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_hours integer := coalesce((SELECT return_window_hours FROM public.platform_settings LIMIT 1), 24);
  v_end timestamptz;
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR coalesce(auth.role(), 'postgres') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oi.product_title, oi.customisation IS NOT NULL AS customised, vo.id AS vendor_order_id, vo.status,
           vo.return_window_ends_on, vo.return_window_ends_at, vo.delivered_at
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
    IF r.customised THEN
      IF NEW.request_type IS DISTINCT FROM 'return' THEN
        RAISE EXCEPTION '"%" was customised for you, so it can''t be exchanged.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      IF coalesce(NEW.reason, '') NOT IN ('Defective or damaged product', 'Wrong item received') THEN
        RAISE EXCEPTION '"%" was customised for you - it can only be returned if it arrived damaged or was the wrong item.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_end := coalesce(
      r.return_window_ends_at,
      CASE WHEN r.return_window_ends_on IS NOT NULL
           THEN ((r.return_window_ends_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - interval '1 second' END,
      coalesce(r.delivered_at, now()) + make_interval(hours => v_hours));
    IF now() > v_end THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title,
        to_char(v_end AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH12:MI AM')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- The last day of a part's window, for its payout date: the same window for
-- every part now (customised pieces included).
CREATE OR REPLACE FUNCTION public.vendor_order_window_end(_vendor_order_id uuid, _delivered_at timestamp with time zone, _window_end date)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    _window_end,
    ((coalesce(_delivered_at, now())
      + make_interval(hours => coalesce((SELECT return_window_hours FROM public.platform_settings LIMIT 1), 24)))
     AT TIME ZONE 'Asia/Kolkata')::date);
$$;
REVOKE ALL ON FUNCTION public.vendor_order_window_end(uuid, timestamptz, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendor_order_window_end(uuid, timestamptz, date) TO authenticated, service_role;
