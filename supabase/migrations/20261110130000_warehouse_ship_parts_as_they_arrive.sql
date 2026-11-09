-- The warehouse no longer waits for every boutique's part of an order
-- (client, 10 Nov 2026): whatever has arrived and passed inspection is
-- packed and sent to the customer straight away; a later part follows in
-- its own parcel. Any warehouse operator may do this - it used to need an
-- admin (_allow_partial), which is now ignored and kept only so existing
-- callers keep working.
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

  INSERT INTO public.warehouse_dispatches (order_id, warehouse_id, purpose, weight_kg, length_cm, breadth_cm, height_cm, packed_by)
  VALUES (_order_id, v_order.warehouse_id, 'order', _weight_kg, _length_cm, _breadth_cm, _height_cm, auth.uid())
  RETURNING * INTO v_dispatch;

  UPDATE public.vendor_orders SET dispatch_id = v_dispatch.id WHERE id = ANY (_vendor_order_ids);
  RETURN v_dispatch;
END;
$$;
