-- courier-tracking-webhook only matched the bare "CANCELED"/"CANCELLED"
-- status, so Shiprocket's free-text labels ("Shipment Cancelled - User
-- Reason : Auto Cancelled By Sr", "Pickup Exception", "Pickup Scheduled")
-- fell through to the in_transit default. Re-derive status for shipments
-- already stuck that way from their latest recorded event. Only the shipment
-- row is touched - a courier cancellation never cancels the customer's order.
WITH latest AS (
  SELECT DISTINCT ON (shipment_id) shipment_id, event_status
  FROM public.shipment_events
  WHERE shipment_id IS NOT NULL AND event_status IS NOT NULL
  ORDER BY shipment_id, event_timestamp DESC NULLS LAST, received_at DESC
)
UPDATE public.shipments s
SET status = CASE
      WHEN upper(l.event_status) LIKE '%CANCEL%' THEN 'cancelled'
      ELSE 'pickup_scheduled'
    END,
    status_raw = l.event_status
FROM latest l
WHERE l.shipment_id = s.id
  AND s.status = 'in_transit'
  AND (
    upper(l.event_status) LIKE '%CANCEL%'
    OR upper(l.event_status) LIKE '%PICKUP%'
  )
  AND upper(l.event_status) NOT LIKE '%RTO%'
  AND upper(l.event_status) NOT LIKE '%NDR%';
