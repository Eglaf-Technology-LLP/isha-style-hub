-- Shiprocket treats the order_id we send (their "channel_order_id") as an
-- idempotency key - sending the same value on a retry after a
-- cancellation returns/reuses the SAME stale order (still bound to
-- whatever pickup location it originally had) instead of creating a
-- genuinely fresh one. Confirmed live: a vendor's corrected pickup
-- address never actually took effect on a real retry because of this.
-- Storing the exact per-attempt id we sent lets the webhook still find
-- the right shipment even though it's no longer just the bare
-- vendor_order_id.
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS shiprocket_channel_order_id text;

CREATE INDEX IF NOT EXISTS idx_shipments_channel_order_id
  ON public.shipments(shiprocket_channel_order_id);
