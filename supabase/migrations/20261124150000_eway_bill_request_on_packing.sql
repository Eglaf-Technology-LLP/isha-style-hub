-- E-way bill requests were made when the order was placed ("asked
-- 17-11-2026, 10:13 PM") - for a Made to Order piece that ships about 47
-- days later. Now the boutique's leg is asked for when the boutique packs
-- the order (Ship Now, with the tax invoice), the same moment as the invoice
-- (client corrections Part 2, A16.1). send-vendor-order-email no longer
-- raises them, and the watcher no longer treats an unpacked part as a
-- missing request.

-- Only the warehouse's parcel to the customer (a part that passed the
-- quality check) can be missing a request now.
CREATE OR REPLACE FUNCTION public.eway_bill_missing_requests()
RETURNS TABLE(vendor_order_id uuid, leg text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT eway_bill_threshold AS limit_value FROM platform_settings LIMIT 1)
  SELECT vo.id, 'warehouse_to_customer'
  FROM vendor_orders vo
  CROSS JOIN s
  WHERE vo.status = 'at_warehouse' AND vo.qc_status = 'passed'
    AND (vo.dispatch_id IS NULL OR EXISTS (
      SELECT 1 FROM warehouse_dispatches d WHERE d.id = vo.dispatch_id AND d.status = 'packing'
    ))
    AND NOT EXISTS (
      SELECT 1 FROM eway_bills b
      WHERE b.vendor_order_id = vo.id AND b.leg = 'warehouse_to_customer'
        AND b.return_request_id IS NULL AND b.status <> 'cancelled'
        AND (b.shipment_id IS NULL OR EXISTS (
          SELECT 1 FROM shipments sh WHERE sh.id = b.shipment_id AND sh.status <> 'cancelled'
        ))
    )
    AND public.vendor_order_invoice_value(vo.id) > s.limit_value;
$$;

-- Requests asked for at order time and not made yet, for parts the boutique
-- hasn't packed: withdrawn - Ship Now asks again when it packs. Bills
-- already made (with a number) stay.
UPDATE public.eway_bills b
SET status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = 'Asked for at order time - it is asked for again when the boutique packs the order (Ship Now).'
WHERE b.status = 'pending'
  AND b.ewb_number IS NULL
  AND b.leg IN ('boutique_to_customer', 'boutique_to_warehouse')
  AND b.return_request_id IS NULL
  AND b.shipment_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.shipments sh
    WHERE sh.vendor_order_id = b.vendor_order_id AND sh.shipment_type IN ('forward', 'to_warehouse')
      AND sh.return_request_id IS NULL AND sh.status <> 'cancelled' AND sh.awb_code IS NOT NULL
  );
