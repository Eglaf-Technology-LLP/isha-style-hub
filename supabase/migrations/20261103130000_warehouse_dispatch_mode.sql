-- How the warehouse sends an order with parts from several boutiques - an
-- admin setting, both kept (user, Nov 2026):
--   as_ready  each part goes out as soon as it has arrived and passed the
--             inspection ("jo pehle aaye wo pehle jaaye"); parts ready at
--             the same time go together. The default - what the user chose.
--   combined  the order waits for every part and goes in one parcel; only an
--             admin can send part of it (as before).

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS warehouse_dispatch_mode text NOT NULL DEFAULT 'as_ready'
    CHECK (warehouse_dispatch_mode IN ('as_ready', 'combined'));

CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch(
  _order_id uuid,
  _vendor_order_ids uuid[],
  _weight_kg numeric,
  _length_cm numeric,
  _breadth_cm numeric,
  _height_cm numeric,
  _allow_partial boolean DEFAULT false
)
RETURNS public.warehouse_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_dispatch public.warehouse_dispatches;
  v_bad integer;
  v_missing integer;
  v_as_ready boolean := (SELECT warehouse_dispatch_mode = 'as_ready' FROM public.platform_settings LIMIT 1);
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT id, fulfilment_route, warehouse_id INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.fulfilment_route IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'This order ships straight from the boutique';
  END IF;
  IF coalesce(array_length(_vendor_order_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose what goes in the parcel';
  END IF;
  IF coalesce(_weight_kg, 0) <= 0 OR coalesce(_length_cm, 0) <= 0 OR coalesce(_breadth_cm, 0) <= 0 OR coalesce(_height_cm, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter the packed parcel''s weight and size';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.vendor_orders
  WHERE id = ANY (_vendor_order_ids)
    AND (order_id <> _order_id OR status <> 'at_warehouse' OR qc_status IS DISTINCT FROM 'passed' OR dispatch_id IS NOT NULL);
  IF v_bad > 0 OR (SELECT count(*) FROM public.vendor_orders WHERE id = ANY (_vendor_order_ids)) <> array_length(_vendor_order_ids, 1) THEN
    RAISE EXCEPTION 'Every part in the parcel must be received, pass inspection and not be packed already';
  END IF;

  SELECT count(*) INTO v_missing
  FROM public.vendor_orders
  WHERE order_id = _order_id AND NOT (id = ANY (_vendor_order_ids))
    AND status NOT IN ('cancelled', 'delivered', 'returned', 'shipped', 'out_for_delivery', 'ndr')
    AND dispatch_id IS NULL;
  IF v_missing > 0 AND NOT coalesce(v_as_ready, false) AND NOT (_allow_partial AND public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not every part of this order is ready. Only an admin can send part of an order.';
  END IF;

  INSERT INTO public.warehouse_dispatches (order_id, warehouse_id, purpose, weight_kg, length_cm, breadth_cm, height_cm, packed_by)
  VALUES (_order_id, v_order.warehouse_id, 'order', _weight_kg, _length_cm, _breadth_cm, _height_cm, auth.uid())
  RETURNING * INTO v_dispatch;

  UPDATE public.vendor_orders SET dispatch_id = v_dispatch.id WHERE id = ANY (_vendor_order_ids);
  RETURN v_dispatch;
END;
$$;
REVOKE ALL ON FUNCTION public.warehouse_create_dispatch(uuid, uuid[], numeric, numeric, numeric, numeric, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch(uuid, uuid[], numeric, numeric, numeric, numeric, boolean) TO authenticated;
