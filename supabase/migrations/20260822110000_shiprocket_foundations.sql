-- Shiprocket courier integration: schema foundations.
-- Vendor pickup address/registration, shipments + audit trail, product
-- dimensions for parcel weight, order_items SKU snapshot, and a small
-- token cache for the Shiprocket auth API.

-- 1. Fix vendors.address shape to match orders.shipping_address exactly
-- ({line1,...} -> {address_line1, address_line2, city, state, pincode,
-- country}), and add pickup-registration tracking fields.
UPDATE public.vendors
SET address = jsonb_build_object(
  'address_line1', address->'line1',
  'address_line2', null,
  'city', address->'city',
  'state', address->'state',
  'pincode', address->'pincode',
  'country', 'India'
)
WHERE address IS NOT NULL AND address ? 'line1';

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_location text,
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_registered_at timestamptz;

-- 2. Extend vendor_orders.status with the two courier-driven states the
-- existing 7 values don't cover (RTO already maps to 'returned').
ALTER TABLE public.vendor_orders DROP CONSTRAINT IF EXISTS vendor_orders_status_check;
ALTER TABLE public.vendor_orders ADD CONSTRAINT vendor_orders_status_check
  CHECK (status IN ('pending','confirmed','processing','shipped','out_for_delivery',
                     'delivered','cancelled','returned','ndr'));

-- 3. Optional per-product physical dimensions for parcel weight/size at
-- shipment creation time. Nullable - "Ship Now" falls back to a platform
-- default (300g, 25x20x3cm) for any item missing these, never blocks on it.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS length_cm numeric,
  ADD COLUMN IF NOT EXISTS breadth_cm numeric,
  ADD COLUMN IF NOT EXISTS height_cm numeric;

-- 4. Snapshot SKU on order_items at checkout time, same rationale as the
-- already-snapshotted product_title/variant_title (product can change
-- or be deleted after the order is placed).
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sku text;

-- 5. shipments: one row per courier booking (forward, return, or either
-- leg of an exchange).
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  shipment_type text NOT NULL DEFAULT 'forward'
    CHECK (shipment_type IN ('forward','return','exchange_forward','exchange_return')),
  shiprocket_order_id bigint,
  shiprocket_shipment_id bigint,
  awb_code text UNIQUE,
  courier_id integer,
  courier_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awb_assigned','pickup_scheduled','picked_up',
                       'in_transit','out_for_delivery','delivered','ndr','rto',
                       'cancelled','lost')),
  status_raw text,
  label_url text,
  manifest_url text,
  invoice_url text,
  pickup_scheduled_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  rto_initiated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipments_vendor_order_id ON public.shipments(vendor_order_id);
CREATE INDEX idx_shipments_return_request_id ON public.shipments(return_request_id);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor members and admins view shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_orders vo
    WHERE vo.id = shipments.vendor_order_id
      AND (public.is_vendor_member(auth.uid(), vo.vendor_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Customers view shipments on their own orders"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE vo.id = shipments.vendor_order_id AND o.user_id = auth.uid()
  ));

-- No client-writable policy at all, by design - only the service-role
-- key (used exclusively by the Shiprocket edge functions) can write here,
-- same lockdown pattern as payments.payment_status.

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. shipment_events: append-only audit trail of every webhook tracking
-- event received, so "is anything missing or wrong" can always be
-- answered from real data rather than trusting a status column alone.
CREATE TABLE public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES public.shipments(id) ON DELETE CASCADE,
  awb_code text NOT NULL,
  event_status text,
  event_status_id integer,
  activity text,
  location text,
  event_timestamp timestamptz,
  raw_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_shipment_events_dedupe
  ON public.shipment_events(shipment_id, event_status_id, event_timestamp)
  WHERE shipment_id IS NOT NULL;

CREATE INDEX idx_shipment_events_awb_code ON public.shipment_events(awb_code);

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor members and admins view shipment events"
  ON public.shipment_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shipments s
    JOIN public.vendor_orders vo ON vo.id = s.vendor_order_id
    WHERE s.id = shipment_events.shipment_id
      AND (public.is_vendor_member(auth.uid(), vo.vendor_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Customers view shipment events on their own orders"
  ON public.shipment_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shipments s
    JOIN public.vendor_orders vo ON vo.id = s.vendor_order_id
    JOIN public.orders o ON o.id = vo.order_id
    WHERE s.id = shipment_events.shipment_id AND o.user_id = auth.uid()
  ));

-- 7. shiprocket_tokens: single-row cache for the auth bearer token
-- (valid ~10 days), service-role only - avoids re-authenticating on
-- every edge function invocation.
CREATE TABLE public.shiprocket_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shiprocket_tokens_singleton CHECK (id = 1)
);

ALTER TABLE public.shiprocket_tokens ENABLE ROW LEVEL SECURITY;
-- No policies at all - service-role only, no client access whatsoever.
