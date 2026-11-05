-- Customised pieces (Part 8 extra list): returnable only when the piece
-- arrived damaged or was the wrong item, and only within 24 hours of
-- delivery - never exchanged. Was: never returnable at all.
--
-- The two reasons must match RETURN_REASONS_CUSTOMISED in
-- src/components/ReturnRequestForm.tsx.

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
    SELECT oi.product_title, oi.customisation IS NOT NULL AS customised, vo.id AS vendor_order_id, vo.status,
           vo.return_window_ends_on, vo.delivered_at
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
      IF coalesce(r.delivered_at, now()) + interval '24 hours' < now() THEN
        RAISE EXCEPTION 'The 24-hour return window for "%" (customised) has closed.', r.product_title
          USING ERRCODE = 'check_violation';
      END IF;
      CONTINUE;
    END IF;
    IF r.return_window_ends_on IS NOT NULL AND v_today > r.return_window_ends_on THEN
      RAISE EXCEPTION 'The return window for "%" closed on %.', r.product_title, to_char(r.return_window_ends_on, 'DD-MM-YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- A boutique part made only of customised pieces now has a 1-day window
-- (the 24 hours above), so its payout waits for it like any other part.
CREATE OR REPLACE FUNCTION public.vendor_order_window_end(_vendor_order_id uuid, _delivered_at timestamp with time zone, _window_end date)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id AND oi.customisation IS NULL
    ) THEN (coalesce(_delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date + 1
    ELSE coalesce(
      _window_end,
      (coalesce(_delivered_at, now()) AT TIME ZONE 'Asia/Kolkata')::date
        + coalesce((SELECT v.return_window_days FROM public.vendor_orders vo JOIN public.vendors v ON v.id = vo.vendor_id
                    WHERE vo.id = _vendor_order_id), 7))
  END;
$$;
