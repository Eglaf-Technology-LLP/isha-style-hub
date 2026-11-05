-- Re-derive shipment status for rows the old webhook mapping got wrong,
-- from each shipment's latest recorded event. Only shipment rows change - a
-- courier cancellation never cancels the customer's order.
--
-- 1. Shiprocket's auto-cancel after failed pickups arrives as current_status
--    "NEW" with the AWB released (awb_assigned_date null), which the old
--    mapping stored as a fresh "pending" booking while still showing the
--    dead AWB. These become cancelled, with the courier's reason kept.
-- 2. Free-text cancel/pickup labels that fell through to in_transit.
CREATE TEMP TABLE courier_backfill ON COMMIT DROP AS
WITH latest AS (
  SELECT DISTINCT ON (shipment_id) shipment_id, event_status, raw_payload
  FROM public.shipment_events
  WHERE shipment_id IS NOT NULL AND event_status IS NOT NULL
  ORDER BY shipment_id, event_timestamp DESC NULLS LAST, received_at DESC
)
SELECT
  s.id AS shipment_id,
  s.vendor_order_id,
  s.awb_code,
  CASE
    WHEN upper(l.event_status) = 'NEW' THEN 'cancelled'
    WHEN upper(l.event_status) LIKE '%CANCEL%' THEN 'cancelled'
    ELSE 'pickup_scheduled'
  END AS new_status,
  CASE
    WHEN upper(l.event_status) = 'NEW' THEN
      'Pickup cancelled by courier'
      || coalesce(' - ' || nullif(l.raw_payload->>'pickup_exception_reason', ''), '')
    ELSE l.event_status
  END AS new_status_raw
FROM public.shipments s
JOIN latest l ON l.shipment_id = s.id
WHERE s.shipment_type IN ('forward', 'exchange_forward')
  AND s.status <> 'cancelled'
  AND (
    (
      upper(l.event_status) = 'NEW'
      AND s.awb_code IS NOT NULL
      AND coalesce(l.raw_payload->>'awb_assigned_date', '') = ''
    )
    OR (
      s.status = 'in_transit'
      AND (upper(l.event_status) LIKE '%CANCEL%' OR upper(l.event_status) LIKE '%PICKUP%')
      AND upper(l.event_status) NOT LIKE '%RTO%'
      AND upper(l.event_status) NOT LIKE '%NDR%'
    )
  );

UPDATE public.shipments s
SET status = b.new_status, status_raw = b.new_status_raw
FROM courier_backfill b
WHERE b.shipment_id = s.id;

-- Same bell notification the webhook now sends, so a boutique with a dead
-- booking from before this fix finds out it has to book again.
INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
SELECT recipient.user_id, 'order', 'pickup_cancelled', 'Courier pickup cancelled',
       format('%s (AWB %s) for order #%s. Please book the shipment again.',
              b.new_status_raw, b.awb_code, upper(left(b.vendor_order_id::text, 8))),
       recipient.link_url
FROM courier_backfill b
JOIN public.vendor_orders vo ON vo.id = b.vendor_order_id
CROSS JOIN LATERAL (
  SELECT vm.user_id, '/vendor'::text AS link_url FROM public.vendor_members vm WHERE vm.vendor_id = vo.vendor_id
  UNION
  SELECT a.user_id, '/admin'::text FROM public.admin_user_ids() AS a(user_id)
) recipient
WHERE b.new_status = 'cancelled';
