-- Warehouse logistics (requirement #19).
--
-- Forward: boutique -> AllBoutiqs warehouse -> customer. The warehouse waits
-- for every boutique's parcel of an order, inspects and repacks, and sends ONE
-- parcel to the customer. Returns go to the warehouse by default (admin can
-- send one straight to the boutique); the warehouse inspects, then refunds and
-- forwards the item to the boutique, or sends it back to the customer.
--
-- Orders placed before this (and any placed while routing is switched off)
-- keep fulfilment_route = 'direct' and run exactly as before.
--
-- Agreed rules (2026-10-11):
--   * delivery estimate = slowest boutique (preparation + courier to warehouse)
--     + 1 working day at the warehouse + courier to the customer; Sundays and
--     warehouse holidays don't count, parcels received after 17:00 count from
--     the next day;
--   * the warehouse waits up to 3 days past a parcel's expected arrival, then
--     admin sends what has arrived or cancels the missing item;
--   * an item failing inspection goes back to the boutique and is cancelled and
--     refunded by default (admin may ask for a replacement instead);
--   * a return's refund is issued when it passes inspection at the warehouse;
--   * AllBoutiqs pays every courier leg for now - each leg's cost is recorded.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS warehouse_routing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_prep_days integer NOT NULL DEFAULT 2
    CHECK (default_prep_days BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS warehouse_handling_days integer NOT NULL DEFAULT 1
    CHECK (warehouse_handling_days BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS warehouse_cutoff_hour integer NOT NULL DEFAULT 17
    CHECK (warehouse_cutoff_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS warehouse_max_wait_days integer NOT NULL DEFAULT 3
    CHECK (warehouse_max_wait_days BETWEEN 1 AND 30),
  -- Courier days from a boutique to the warehouse, used for a parcel's
  -- expected arrival until the boutique books it and the courier gives a date.
  ADD COLUMN IF NOT EXISTS warehouse_inbound_transit_days integer NOT NULL DEFAULT 3
    CHECK (warehouse_inbound_transit_days BETWEEN 1 AND 15);

-- ---------------------------------------------------------------------------
-- 2. Warehouses, holidays, roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  contact_email text NOT NULL,
  -- Same shape as vendors.address / orders.shipping_address.
  address jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  shiprocket_pickup_location text,
  shiprocket_pickup_id integer,
  shiprocket_pickup_registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_single_default ON public.warehouses (is_default) WHERE is_default;

CREATE TRIGGER update_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Shiprocket can't edit a pickup address, only add one - a changed address or
-- phone must be registered again (ensurePickupLocation does it on next use).
CREATE OR REPLACE FUNCTION public.reset_warehouse_pickup_registration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.address IS DISTINCT FROM OLD.address
     OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
     OR NEW.contact_name IS DISTINCT FROM OLD.contact_name THEN
    NEW.shiprocket_pickup_location := NULL;
    NEW.shiprocket_pickup_id := NULL;
    NEW.shiprocket_pickup_registered_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reset_warehouse_pickup_registration_trigger
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.reset_warehouse_pickup_registration();

INSERT INTO public.warehouses (code, name, contact_name, contact_phone, contact_email, address, is_default)
VALUES (
  'DEESA',
  'AllBoutiqs Warehouse - Deesa',
  'Hasmukh Soni',
  '9724489316',
  'founder@allboutiqs.com',
  jsonb_build_object(
    'address_line1', '19, Puniynagari',
    'address_line2', 'Near Smrudhipark, Banaskantha',
    'city', 'Deesa',
    'state', 'Gujarat',
    'pincode', '385535',
    'country', 'India'
  ),
  true
)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.warehouse_holidays (
  holiday_date date PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admins and warehouse staff. Compared as text so this works in the same
-- deploy that adds the 'warehouse_staff' enum value.
CREATE OR REPLACE FUNCTION public.can_operate_warehouse(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'warehouse_staff')
  );
$$;

-- For guard triggers (which must be SECURITY INVOKER so current_user is the
-- real caller): a write made by the server - an edge function (service_role),
-- a cron job, or a SECURITY DEFINER function such as the warehouse RPCs below
-- (current_user is then the function owner) - or by an admin / warehouse
-- staff member. auth.role() alone can't tell these apart: a trigger fired from
-- inside a customer's request still sees the customer's JWT.
CREATE OR REPLACE FUNCTION public.is_server_or_warehouse()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_user::text NOT IN ('anon', 'authenticated')
      OR public.can_operate_warehouse(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.admin_user_ids_and_warehouse()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT user_id FROM public.user_roles WHERE role::text IN ('admin', 'warehouse_staff');
$$;
REVOKE ALL ON FUNCTION public.admin_user_ids_and_warehouse() FROM public, anon, authenticated;

-- Bell notification for everyone who works the warehouse (admins included).
CREATE OR REPLACE FUNCTION public.notify_warehouse(_type text, _title text, _body text, _link text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, category, type, title, body, link_url)
  SELECT u, 'order', _type, _title, _body, _link FROM public.admin_user_ids_and_warehouse() AS u;
$$;
REVOKE ALL ON FUNCTION public.notify_warehouse(text, text, text, text) FROM public, anon, authenticated;

-- A working day at the warehouse: not a Sunday, not a listed holiday.
CREATE OR REPLACE FUNCTION public.is_warehouse_working_day(_d date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT extract(isodow FROM _d) <> 7
     AND NOT EXISTS (SELECT 1 FROM public.warehouse_holidays WHERE holiday_date = _d);
$$;

CREATE OR REPLACE FUNCTION public.add_warehouse_working_days(_d date, _n integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  d date := _d;
  added integer := 0;
BEGIN
  WHILE added < coalesce(_n, 0) LOOP
    d := d + 1;
    IF public.is_warehouse_working_day(d) THEN
      added := added + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- When a parcel received at this moment must leave the warehouse: the
-- handling days count from the receiving day, or the next day if it came in
-- after the cut-off hour.
CREATE OR REPLACE FUNCTION public.warehouse_dispatch_by(_received_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.add_warehouse_working_days(
    (_received_at AT TIME ZONE 'Asia/Kolkata')::date
      + CASE WHEN extract(hour FROM _received_at AT TIME ZONE 'Asia/Kolkata') >= ps.warehouse_cutoff_hour THEN 1 ELSE 0 END,
    ps.warehouse_handling_days)
  FROM public.platform_settings ps
  WHERE ps.id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Preparation time
-- ---------------------------------------------------------------------------

-- Boutique default ("ready to ship in N days"); NULL = platform default (2).
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS default_prep_days integer CHECK (default_prep_days BETWEEN 0 AND 60);

-- Per-product override, e.g. made to order in 10 days.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS prep_days integer CHECK (prep_days BETWEEN 0 AND 90),
  ADD COLUMN IF NOT EXISTS made_to_order boolean NOT NULL DEFAULT false;

-- Snapshot at checkout so a later change never moves an existing order's dates.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS prep_days integer;

CREATE OR REPLACE FUNCTION public.snapshot_order_item_prep_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT coalesce(p.prep_days, v.default_prep_days, ps.default_prep_days, 2)
  INTO NEW.prep_days
  FROM public.platform_settings ps
  LEFT JOIN public.products p ON p.id::text = NEW.product_id::text
  LEFT JOIN public.vendors v ON v.id = coalesce(NEW.vendor_id, p.vendor_id)
  WHERE ps.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_order_item_prep_days_trigger ON public.order_items;
CREATE TRIGGER snapshot_order_item_prep_days_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_prep_days();

-- ---------------------------------------------------------------------------
-- 4. Orders: which route they take
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfilment_route text NOT NULL DEFAULT 'direct'
    CHECK (fulfilment_route IN ('direct', 'warehouse')),
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  -- The date shown to the customer at checkout (display only - replaced by
  -- the courier's own date once the parcel leaves the warehouse).
  ADD COLUMN IF NOT EXISTS estimated_delivery_date date;

-- Decided by the server at insert, never by the client.
CREATE OR REPLACE FUNCTION public.route_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse uuid;
BEGIN
  SELECT w.id INTO v_warehouse
  FROM public.warehouses w
  JOIN public.platform_settings ps ON ps.id AND ps.warehouse_routing_enabled
  WHERE w.is_default AND w.is_active
  LIMIT 1;

  IF v_warehouse IS NULL THEN
    NEW.fulfilment_route := 'direct';
    NEW.warehouse_id := NULL;
  ELSE
    NEW.fulfilment_route := 'warehouse';
    NEW.warehouse_id := v_warehouse;
  END IF;

  IF NEW.estimated_delivery_date IS NOT NULL
     AND NEW.estimated_delivery_date NOT BETWEEN current_date AND current_date + 120 THEN
    NEW.estimated_delivery_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_new_order_trigger ON public.orders;
CREATE TRIGGER route_new_order_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.route_new_order();

-- ---------------------------------------------------------------------------
-- 5. Customer parcels leaving the warehouse
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warehouse_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  -- order: the order's own items. exchange_replacement: the replacement for
  -- an exchange. return_send_back: a return that failed inspection, going
  -- back to the customer.
  purpose text NOT NULL DEFAULT 'order'
    CHECK (purpose IN ('order', 'exchange_replacement', 'return_send_back')),
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'packing'
    CHECK (status IN ('packing', 'booked', 'shipped', 'delivered', 'ndr', 'rto', 'cancelled')),
  weight_kg numeric NOT NULL CHECK (weight_kg > 0),
  length_cm numeric NOT NULL CHECK (length_cm > 0),
  breadth_cm numeric NOT NULL CHECK (breadth_cm > 0),
  height_cm numeric NOT NULL CHECK (height_cm > 0),
  packed_by uuid REFERENCES auth.users(id),
  packed_at timestamptz NOT NULL DEFAULT now(),
  -- A parcel the courier brought back (RTO): when staff received it.
  rto_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purpose = 'order' OR return_request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_dispatches_order_id ON public.warehouse_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_dispatches_status ON public.warehouse_dispatches(status);

CREATE TRIGGER update_warehouse_dispatches_updated_at
  BEFORE UPDATE ON public.warehouse_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Boutique orders at the warehouse
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_orders DROP CONSTRAINT IF EXISTS vendor_orders_status_check;
ALTER TABLE public.vendor_orders ADD CONSTRAINT vendor_orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery',
                    'delivered', 'cancelled', 'returned', 'ndr',
                    'in_transit_to_warehouse', 'at_warehouse', 'qc_failed'));

ALTER TABLE public.vendor_orders
  -- The date the boutique should hand the parcel to the courier
  -- (order date + its slowest item's preparation days).
  ADD COLUMN IF NOT EXISTS ready_by date,
  -- When the parcel is expected at the warehouse: ready_by + courier days
  -- (the courier's own date once booked). The 3-day wait counts from here.
  ADD COLUMN IF NOT EXISTS expected_at_warehouse_on date,
  -- Courier said delivered at the warehouse.
  ADD COLUMN IF NOT EXISTS arrived_at_warehouse_at timestamptz,
  -- Staff confirmed receipt and shelved it.
  ADD COLUMN IF NOT EXISTS received_at_warehouse_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS warehouse_shelf text,
  ADD COLUMN IF NOT EXISTS qc_status text CHECK (qc_status IN ('pending', 'passed', 'failed')),
  ADD COLUMN IF NOT EXISTS qc_notes text,
  ADD COLUMN IF NOT EXISTS qc_at timestamptz,
  ADD COLUMN IF NOT EXISTS qc_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.warehouse_dispatches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS late_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vendor_orders_dispatch_id ON public.vendor_orders(dispatch_id);

-- ready_by / expected arrival from the items' snapshotted preparation days.
CREATE OR REPLACE FUNCTION public.plan_vendor_order_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready date;
  v_transit integer;
BEGIN
  IF NEW.vendor_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.add_warehouse_working_days((vo.created_at AT TIME ZONE 'Asia/Kolkata')::date, max(coalesce(oi.prep_days, 0)))
  INTO v_ready
  FROM public.vendor_orders vo
  JOIN public.order_items oi ON oi.vendor_order_id = vo.id
  WHERE vo.id = NEW.vendor_order_id
  GROUP BY vo.created_at;

  SELECT warehouse_inbound_transit_days INTO v_transit FROM public.platform_settings WHERE id;

  UPDATE public.vendor_orders
  SET ready_by = v_ready,
      expected_at_warehouse_on = v_ready + coalesce(v_transit, 3)
  WHERE id = NEW.vendor_order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_vendor_order_dates_trigger ON public.order_items;
CREATE TRIGGER plan_vendor_order_dates_trigger
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.plan_vendor_order_dates();

-- Only the server and warehouse staff move a boutique order through the
-- warehouse - boutiques can update their own vendor_orders, customers insert
-- them at checkout, and neither may touch these.
CREATE OR REPLACE FUNCTION public.guard_vendor_order_warehouse_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_server_or_warehouse() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed') THEN
      RAISE EXCEPTION 'Invalid order status';
    END IF;
    NEW.ready_by := NULL;
    NEW.expected_at_warehouse_on := NULL;
    NEW.arrived_at_warehouse_at := NULL;
    NEW.received_at_warehouse_at := NULL;
    NEW.received_by := NULL;
    NEW.warehouse_shelf := NULL;
    NEW.qc_status := NULL;
    NEW.qc_notes := NULL;
    NEW.qc_at := NULL;
    NEW.qc_by := NULL;
    NEW.dispatch_id := NULL;
    NEW.late_reminder_sent_at := NULL;
    NEW.overdue_alerted_at := NULL;
    RETURN NEW;
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status
        AND (NEW.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed')
             OR OLD.status IN ('in_transit_to_warehouse', 'at_warehouse', 'qc_failed')))
     OR NEW.ready_by IS DISTINCT FROM OLD.ready_by
     OR NEW.expected_at_warehouse_on IS DISTINCT FROM OLD.expected_at_warehouse_on
     OR NEW.arrived_at_warehouse_at IS DISTINCT FROM OLD.arrived_at_warehouse_at
     OR NEW.received_at_warehouse_at IS DISTINCT FROM OLD.received_at_warehouse_at
     OR NEW.received_by IS DISTINCT FROM OLD.received_by
     OR NEW.warehouse_shelf IS DISTINCT FROM OLD.warehouse_shelf
     OR NEW.qc_status IS DISTINCT FROM OLD.qc_status
     OR NEW.qc_notes IS DISTINCT FROM OLD.qc_notes
     OR NEW.qc_at IS DISTINCT FROM OLD.qc_at
     OR NEW.qc_by IS DISTINCT FROM OLD.qc_by
     OR NEW.dispatch_id IS DISTINCT FROM OLD.dispatch_id
     OR NEW.late_reminder_sent_at IS DISTINCT FROM OLD.late_reminder_sent_at
     OR NEW.overdue_alerted_at IS DISTINCT FROM OLD.overdue_alerted_at THEN
    RAISE EXCEPTION 'Only the AllBoutiqs warehouse can change this';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_order_warehouse_fields_trigger ON public.vendor_orders;
CREATE TRIGGER guard_vendor_order_warehouse_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_order_warehouse_fields();

-- ---------------------------------------------------------------------------
-- 7. Items going back from the warehouse to a boutique
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.boutique_send_backs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_order_id uuid REFERENCES public.vendor_orders(id) ON DELETE SET NULL,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  -- order_cancelled: customer cancelled after it reached the warehouse.
  -- qc_failed: failed inspection, item cancelled and refunded.
  -- qc_failed_replacement: failed inspection, boutique sends a replacement.
  -- return_forward: a customer return that passed inspection.
  -- exchange_forward: the old item from an exchange.
  -- replacement_qc_failed: an exchange replacement that failed inspection.
  -- replacement_unused: an exchange replacement no longer needed (the old
  --   item failed inspection).
  -- rto_cancelled: couldn't be delivered and the order was cancelled.
  reason text NOT NULL CHECK (reason IN ('order_cancelled', 'qc_failed', 'qc_failed_replacement', 'return_forward',
                                         'exchange_forward', 'replacement_qc_failed', 'replacement_unused',
                                         'rto_cancelled')),
  -- [{order_item_id, product_title, quantity, size, color, product_id}]
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'required' CHECK (status IN ('required', 'booked', 'delivered', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boutique_send_backs_status ON public.boutique_send_backs(status);
CREATE INDEX IF NOT EXISTS idx_boutique_send_backs_vendor_id ON public.boutique_send_backs(vendor_id);

CREATE TRIGGER update_boutique_send_backs_updated_at
  BEFORE UPDATE ON public.boutique_send_backs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The items of one boutique order, as a send-back snapshot.
CREATE OR REPLACE FUNCTION public.vendor_order_items_snapshot(_vendor_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'order_item_id', oi.id, 'product_id', oi.product_id, 'product_title', oi.product_title,
    'quantity', oi.quantity, 'size', oi.size, 'color', oi.color, 'sku', oi.sku, 'price', oi.price)), '[]'::jsonb)
  FROM public.order_items oi WHERE oi.vendor_order_id = _vendor_order_id;
$$;
REVOKE ALL ON FUNCTION public.vendor_order_items_snapshot(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_boutique_send_back(_vendor_order_id uuid, _reason text, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_vo record;
BEGIN
  SELECT vo.id, vo.vendor_id, vo.order_id, o.warehouse_id
  INTO v_vo
  FROM public.vendor_orders vo JOIN public.orders o ON o.id = vo.order_id
  WHERE vo.id = _vendor_order_id;
  IF NOT FOUND OR v_vo.warehouse_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- One open send-back per boutique order.
  SELECT id INTO v_id FROM public.boutique_send_backs
  WHERE vendor_order_id = _vendor_order_id AND return_request_id IS NULL AND status IN ('required', 'booked');
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.boutique_send_backs (warehouse_id, vendor_id, order_id, vendor_order_id, reason, items, notes)
  VALUES (v_vo.warehouse_id, v_vo.vendor_id, v_vo.order_id, v_vo.id, _reason,
          public.vendor_order_items_snapshot(v_vo.id), _notes)
  RETURNING id INTO v_id;

  PERFORM public.notify_vendor_members(v_vo.vendor_id, 'warehouse_send_back', 'Items coming back to you',
    format('Items from order %s are being sent back to you from the AllBoutiqs warehouse (%s).',
           public.order_ref(v_vo.order_id), replace(_reason, '_', ' ')),
    public.nlink('/vendor', 'orders', v_vo.id));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_boutique_send_back(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_boutique_send_back(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Shipments: the new legs
-- ---------------------------------------------------------------------------

ALTER TABLE public.shipments ALTER COLUMN vendor_order_id DROP NOT NULL;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.warehouse_dispatches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_id uuid REFERENCES public.boutique_send_backs(id) ON DELETE SET NULL,
  -- The courier fare for this leg, and who pays it (AllBoutiqs for now).
  ADD COLUMN IF NOT EXISTS courier_cost numeric,
  ADD COLUMN IF NOT EXISTS cost_borne_by text NOT NULL DEFAULT 'allboutiqs'
    CHECK (cost_borne_by IN ('allboutiqs', 'boutique', 'customer'));

UPDATE public.shipments s
SET order_id = vo.order_id
FROM public.vendor_orders vo
WHERE vo.id = s.vendor_order_id AND s.order_id IS NULL;

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_shipment_type_check;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_shipment_type_check
  CHECK (shipment_type IN ('forward', 'return', 'exchange_forward', 'exchange_return',
                           -- boutique -> warehouse (an order's parcel, or an exchange replacement)
                           'to_warehouse',
                           -- warehouse -> customer (a dispatch)
                           'warehouse_to_customer',
                           -- customer -> warehouse (a return or the old item of an exchange)
                           'return_to_warehouse',
                           -- warehouse -> boutique (a send-back)
                           'warehouse_to_boutique'));

ALTER TABLE public.shipments DROP CONSTRAINT IF EXISTS shipments_has_owner;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_has_owner
  CHECK (vendor_order_id IS NOT NULL OR order_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_dispatch_id ON public.shipments(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_shipments_send_back_id ON public.shipments(send_back_id);

-- ---------------------------------------------------------------------------
-- 9. Returns through the warehouse
-- ---------------------------------------------------------------------------

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS return_destination text CHECK (return_destination IN ('warehouse', 'boutique')),
  ADD COLUMN IF NOT EXISTS received_at_warehouse_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS warehouse_shelf text,
  ADD COLUMN IF NOT EXISTS warehouse_qc_status text CHECK (warehouse_qc_status IN ('passed', 'failed')),
  ADD COLUMN IF NOT EXISTS warehouse_qc_notes text,
  ADD COLUMN IF NOT EXISTS warehouse_qc_at timestamptz,
  ADD COLUMN IF NOT EXISTS warehouse_qc_by uuid REFERENCES auth.users(id),
  -- Exchange replacement, sent by the boutique to the warehouse.
  ADD COLUMN IF NOT EXISTS replacement_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_qc_status text CHECK (replacement_qc_status IN ('passed', 'failed')),
  ADD COLUMN IF NOT EXISTS replacement_qc_notes text;

-- Existing requests ran the old way (straight to the boutique).
UPDATE public.return_requests SET return_destination = 'boutique' WHERE return_destination IS NULL;

CREATE OR REPLACE FUNCTION public.set_return_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT CASE WHEN o.fulfilment_route = 'warehouse' THEN 'warehouse' ELSE 'boutique' END
  INTO NEW.return_destination
  FROM public.orders o WHERE o.id = NEW.order_id;
  NEW.return_destination := coalesce(NEW.return_destination, 'boutique');
  NEW.received_at_warehouse_at := NULL;
  NEW.received_by := NULL;
  NEW.warehouse_shelf := NULL;
  NEW.warehouse_qc_status := NULL;
  NEW.warehouse_qc_notes := NULL;
  NEW.warehouse_qc_at := NULL;
  NEW.warehouse_qc_by := NULL;
  NEW.replacement_received_at := NULL;
  NEW.replacement_qc_status := NULL;
  NEW.replacement_qc_notes := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_return_destination_trigger ON public.return_requests;
CREATE TRIGGER set_return_destination_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_return_destination();

-- Admin chooses the destination, and only before a pickup is booked; the
-- warehouse columns are written only by the warehouse/server.
CREATE OR REPLACE FUNCTION public.guard_return_warehouse_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.return_destination IS DISTINCT FROM OLD.return_destination THEN
    IF current_user::text IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only the AllBoutiqs team can change where a return goes';
    END IF;
    IF NEW.return_destination = 'warehouse'
       AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND warehouse_id IS NOT NULL) THEN
      RAISE EXCEPTION 'This order was not shipped through the warehouse';
    END IF;
    IF EXISTS (SELECT 1 FROM public.shipments WHERE return_request_id = NEW.id AND status <> 'cancelled') THEN
      RAISE EXCEPTION 'A courier pickup is already booked for this request - cancel it before changing where it goes';
    END IF;
  END IF;

  IF NOT public.is_server_or_warehouse() AND (
       NEW.received_at_warehouse_at IS DISTINCT FROM OLD.received_at_warehouse_at
    OR NEW.received_by IS DISTINCT FROM OLD.received_by
    OR NEW.warehouse_shelf IS DISTINCT FROM OLD.warehouse_shelf
    OR NEW.warehouse_qc_status IS DISTINCT FROM OLD.warehouse_qc_status
    OR NEW.warehouse_qc_notes IS DISTINCT FROM OLD.warehouse_qc_notes
    OR NEW.warehouse_qc_at IS DISTINCT FROM OLD.warehouse_qc_at
    OR NEW.warehouse_qc_by IS DISTINCT FROM OLD.warehouse_qc_by
    OR NEW.replacement_received_at IS DISTINCT FROM OLD.replacement_received_at
    OR NEW.replacement_qc_status IS DISTINCT FROM OLD.replacement_qc_status
    OR NEW.replacement_qc_notes IS DISTINCT FROM OLD.replacement_qc_notes
    OR (NEW.status IS DISTINCT FROM OLD.status
        AND NEW.status IN ('at_warehouse', 'qc_failed', 'qc_passed', 'replacement_shipped', 'returned_to_customer'))) THEN
    RAISE EXCEPTION 'Only the AllBoutiqs warehouse can change this';
  END IF;

  -- A warehouse return is completed by the warehouse's inspection (which
  -- issues the refund), not by hand.
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.return_destination = 'warehouse' AND NOT public.is_server_or_warehouse() THEN
    RAISE EXCEPTION 'This return is completed by the warehouse once it passes inspection';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_return_warehouse_fields_trigger ON public.return_requests;
CREATE TRIGGER guard_return_warehouse_fields_trigger
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_return_warehouse_fields();

-- ---------------------------------------------------------------------------
-- 10. Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view warehouses"
  ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage warehouses"
  ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.warehouse_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views warehouse holidays"
  ON public.warehouse_holidays FOR SELECT USING (true);
CREATE POLICY "Admins manage warehouse holidays"
  ON public.warehouse_holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Dispatches and send-backs are written only by RPCs below and edge functions.
ALTER TABLE public.warehouse_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Warehouse views dispatches"
  ON public.warehouse_dispatches FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Customers view their own dispatches"
  ON public.warehouse_dispatches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = warehouse_dispatches.order_id AND o.user_id = auth.uid()));
CREATE POLICY "Boutiques view dispatches carrying their orders"
  ON public.warehouse_dispatches FOR SELECT TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

ALTER TABLE public.boutique_send_backs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Warehouse views send-backs"
  ON public.boutique_send_backs FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Boutiques view their own send-backs"
  ON public.boutique_send_backs FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id));

-- Warehouse staff read what they need to receive, inspect, pack and ship.
CREATE POLICY "Warehouse views orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views vendor orders"
  ON public.vendor_orders FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views return requests"
  ON public.return_requests FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
CREATE POLICY "Warehouse views shipments"
  ON public.shipments FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));

-- Shipments recorded against the order (customer parcels from the warehouse,
-- returns spanning boutiques) rather than one boutique order.
CREATE POLICY "Customers view shipments on their orders"
  ON public.shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = shipments.order_id AND o.user_id = auth.uid()));
CREATE POLICY "Boutiques view warehouse parcels carrying their orders"
  ON public.shipments FOR SELECT TO authenticated
  USING (dispatch_id IS NOT NULL AND public.order_contains_vendor_sale(order_id, auth.uid()));
CREATE POLICY "Boutiques view their send-back shipments"
  ON public.shipments FOR SELECT TO authenticated
  USING (send_back_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.boutique_send_backs b
    WHERE b.id = shipments.send_back_id AND public.is_vendor_member(auth.uid(), b.vendor_id)));

-- Whoever can see a shipment can see its tracking events.
CREATE POLICY "Viewers of a shipment view its events"
  ON public.shipment_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_events.shipment_id));

-- ---------------------------------------------------------------------------
-- 11. Customer and boutique notifications for the warehouse route
-- ---------------------------------------------------------------------------

-- The boutique order whose row speaks for a whole customer parcel, so a parcel
-- of three boutiques' items sends one email, not three.
CREATE OR REPLACE FUNCTION public.dispatch_lead_vendor_order(_dispatch_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.vendor_orders WHERE dispatch_id = _dispatch_id ORDER BY id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := upper(public.order_ref(NEW.order_id));
  v_email text;
  v_route text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT fulfilment_route INTO v_route FROM public.orders WHERE id = NEW.order_id;

  IF v_route = 'warehouse' THEN
    CASE NEW.status
      WHEN 'confirmed' THEN
        -- Once per order: the first boutique to confirm.
        IF OLD.status = 'pending' AND NOT EXISTS (
          SELECT 1 FROM public.vendor_orders s
          WHERE s.order_id = NEW.order_id AND s.id <> NEW.id AND s.status NOT IN ('pending', 'cancelled')) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Order confirmed',
            format('Your order %s was confirmed and is being prepared.', v_ref));
          v_email := 'confirmed';
        END IF;
      WHEN 'at_warehouse' THEN
        -- Once every part has reached the warehouse (not on a parcel coming back).
        IF OLD.status <> 'returned' AND NOT EXISTS (
          SELECT 1 FROM public.vendor_orders s
          WHERE s.order_id = NEW.order_id AND s.id <> NEW.id
            AND s.status IN ('pending', 'confirmed', 'processing', 'in_transit_to_warehouse')) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_at_warehouse', 'At our quality-check centre',
            format('Your order %s reached our quality-check centre. We''ll check and pack it, then send it to you.', v_ref));
        END IF;
      WHEN 'shipped' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_shipped', 'Order shipped',
            format('Your order %s was packed and is on its way.', v_ref));
          v_email := 'shipped';
        END IF;
      WHEN 'out_for_delivery' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_out_for_delivery', 'Out for delivery',
            format('Your order %s is out for delivery today.', v_ref));
          v_email := 'out_for_delivery';
        END IF;
      WHEN 'delivered' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_delivered', 'Order delivered',
            format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
          v_email := 'delivered';
        END IF;
      WHEN 'ndr' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_delivery_failed', 'Delivery attempt failed',
            format('The courier couldn''t deliver your order %s. They will try again - please keep your phone reachable.', v_ref));
          v_email := 'delivery_failed';
        END IF;
      WHEN 'returned' THEN
        IF NEW.dispatch_id IS NOT NULL AND NEW.id = public.dispatch_lead_vendor_order(NEW.dispatch_id) THEN
          PERFORM public.notify_customer(NEW.order_id, 'order_returned', 'Order could not be delivered',
            format('Your order %s could not be delivered and is coming back to us. Our team will contact you.', v_ref));
        END IF;
      WHEN 'cancelled' THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
          format('Your order %s was cancelled. Any online payment is refunded to your original payment method.', v_ref));
      ELSE
        NULL;
    END CASE;

    IF v_email IS NOT NULL THEN
      PERFORM public.invoke_edge_function('send-order-email',
        jsonb_build_object('orderId', NEW.order_id, 'type', v_email, 'vendorOrderId', NEW.id, 'dispatchId', NEW.dispatch_id));
    END IF;
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      IF OLD.status = 'pending' THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_confirmed', 'Order confirmed',
          format('Your order %s was confirmed and is being prepared.', v_ref));
        v_email := 'confirmed';
      END IF;
    WHEN 'shipped' THEN
      IF OLD.status IN ('pending', 'confirmed', 'processing') THEN
        PERFORM public.notify_customer(NEW.order_id, 'order_shipped', 'Order shipped',
          format('Your order %s is on its way.', v_ref));
        v_email := 'shipped';
      END IF;
    WHEN 'out_for_delivery' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_out_for_delivery', 'Out for delivery',
        format('Your order %s is out for delivery today.', v_ref));
      v_email := 'out_for_delivery';
    WHEN 'delivered' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivered', 'Order delivered',
        format('Your order %s was delivered. If something isn''t right, you can request a return or exchange from My Orders.', v_ref));
      v_email := 'delivered';
    WHEN 'cancelled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_cancelled', 'Order cancelled',
        format('Your order %s was cancelled. Any online payment is refunded to your original payment method.', v_ref));
    WHEN 'ndr' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_delivery_failed', 'Delivery attempt failed',
        format('The courier couldn''t deliver your order %s. They will try again - please keep your phone reachable.', v_ref));
      v_email := 'delivery_failed';
    WHEN 'returned' THEN
      PERFORM public.notify_customer(NEW.order_id, 'order_returned', 'Order returned to the boutique',
        format('Your order %s could not be delivered and went back to the boutique.', v_ref));
    ELSE
      NULL;
  END CASE;

  IF v_email IS NOT NULL THEN
    PERFORM public.invoke_edge_function('send-order-email',
      jsonb_build_object('orderId', NEW.order_id, 'type', v_email, 'vendorOrderId', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_customer_return_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := CASE WHEN NEW.request_type = 'exchange' THEN 'exchange' ELSE 'return' END;
  v_ref text := upper(public.order_ref(NEW.order_id));
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'approved' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_approved', format('Your %s was approved', v_kind),
        format('Your %s request for order %s was approved. A courier will pick the items up.', v_kind, v_ref));
    WHEN 'rejected' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_rejected', format('Your %s request was declined', v_kind),
        format('Your %s request for order %s was declined%s.', v_kind, v_ref,
               coalesce(': ' || nullif(coalesce(NEW.vendor_notes, NEW.admin_notes), ''), '')));
    WHEN 'pickup_scheduled' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_scheduled', 'Pickup scheduled',
        format('A courier pickup is scheduled for your %s on order %s. Please keep the items packed and ready.', v_kind, v_ref));
    WHEN 'picked_up' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_picked_up', 'Items picked up',
        format('The courier picked up your %s for order %s.', v_kind, v_ref));
    WHEN 'at_warehouse' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_at_warehouse', 'Items received',
        format('Your %s for order %s reached our quality-check centre. We''ll inspect it shortly.', v_kind, v_ref));
    WHEN 'qc_passed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_qc_passed', 'Items passed inspection',
        format('Your %s for order %s passed inspection. Your replacement will be sent as soon as it is ready.', v_kind, v_ref));
    WHEN 'qc_failed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_qc_failed', format('Your %s didn''t pass inspection', v_kind),
        format('The items from your %s for order %s didn''t pass our quality check%s. We''re sending them back to you.', v_kind, v_ref,
               coalesce(': ' || nullif(NEW.warehouse_qc_notes, ''), '')));
    WHEN 'replacement_shipped' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_replacement_shipped', 'Replacement shipped',
        format('The replacement for your exchange on order %s is on its way.', v_ref));
    WHEN 'returned_to_customer' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_sent_back', 'Items delivered back to you',
        format('The items from your %s for order %s were delivered back to you.', v_kind, v_ref));
    WHEN 'completed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_completed', format('Your %s is complete', v_kind),
        format('Your %s for order %s is complete.%s', v_kind, v_ref,
               CASE WHEN v_kind = 'return' THEN ' Your refund is on its way.' ELSE ' Your replacement has been delivered.' END));
    WHEN 'pickup_failed' THEN
      PERFORM public.notify_customer(NEW.order_id, 'return_pickup_failed', 'Pickup couldn''t be completed',
        format('The courier couldn''t pick up your %s for order %s. Our team will reschedule it.', v_kind, v_ref));
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Watcher: late boutiques, parcels overdue at the warehouse
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_watch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_wait integer;
  r record;
  v_vendor_name text;
  v_waiting integer;
BEGIN
  SELECT warehouse_max_wait_days INTO v_wait FROM public.platform_settings WHERE id;

  -- A boutique that hasn't booked its parcel by the end of its preparation time.
  FOR r IN
    SELECT vo.id, vo.vendor_id, vo.order_id, vo.ready_by
    FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE o.fulfilment_route = 'warehouse'
      AND vo.status IN ('pending', 'confirmed')
      AND vo.ready_by IS NOT NULL AND vo.ready_by < v_today
      AND vo.late_reminder_sent_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.shipments s
        WHERE s.vendor_order_id = vo.id AND s.shipment_type = 'to_warehouse'
          AND s.return_request_id IS NULL AND s.status <> 'cancelled')
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = r.vendor_id;
    PERFORM public.notify_vendor_members(r.vendor_id, 'warehouse_ship_late', 'Order is late to ship',
      format('Order %s was due to be handed to the courier by %s. Please book the pickup to the AllBoutiqs warehouse now.',
             public.order_ref(r.order_id), to_char(r.ready_by, 'DD Mon')),
      public.nlink('/vendor', 'orders', r.id));
    PERFORM public.notify_admins('order', 'warehouse_ship_late', 'Boutique is late to ship',
      format('%s has not booked order %s, which was due by %s.',
             coalesce(v_vendor_name, 'A boutique'), public.order_ref(r.order_id), to_char(r.ready_by, 'DD Mon')),
      public.nlink('/admin', 'orders', r.id));
    UPDATE public.vendor_orders SET late_reminder_sent_at = now() WHERE id = r.id;
  END LOOP;

  -- A parcel more than the wait limit past its expected arrival.
  FOR r IN
    SELECT vo.id, vo.vendor_id, vo.order_id, vo.expected_at_warehouse_on
    FROM public.vendor_orders vo
    JOIN public.orders o ON o.id = vo.order_id
    WHERE o.fulfilment_route = 'warehouse'
      AND vo.status IN ('pending', 'confirmed', 'processing', 'in_transit_to_warehouse')
      AND vo.overdue_alerted_at IS NULL
      AND vo.expected_at_warehouse_on IS NOT NULL
      AND vo.expected_at_warehouse_on + coalesce(v_wait, 3) < v_today
  LOOP
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = r.vendor_id;
    SELECT count(*) INTO v_waiting FROM public.vendor_orders
    WHERE order_id = r.order_id AND id <> r.id AND status = 'at_warehouse';
    PERFORM public.notify_warehouse('warehouse_parcel_overdue', 'Parcel overdue at the warehouse',
      format('The parcel from %s for order %s was expected by %s and hasn''t arrived.%s',
             coalesce(v_vendor_name, 'a boutique'), public.order_ref(r.order_id), to_char(r.expected_at_warehouse_on, 'DD Mon'),
             CASE WHEN v_waiting > 0
                  THEN format(' %s other part(s) are waiting. Admin: send what has arrived, or cancel the missing item.', v_waiting)
                  ELSE ' Admin: chase the boutique or cancel the item.' END),
      '/warehouse?tab=pack&focus=' || r.order_id::text);
    UPDATE public.vendor_orders SET overdue_alerted_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

SELECT cron.schedule('warehouse-watch', '*/30 * * * *', $$SELECT public.warehouse_watch();$$);

-- ---------------------------------------------------------------------------
-- 13. Warehouse actions (database-only steps; courier bookings and refunds
--     run in the warehouse-actions edge function)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_warehouse_operator()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_operate_warehouse(auth.uid()) THEN
    RAISE EXCEPTION 'Only AllBoutiqs warehouse staff can do this';
  END IF;
END;
$$;

-- Staff confirm a boutique's parcel is in, and where it's shelved.
CREATE OR REPLACE FUNCTION public.warehouse_receive_parcel(_vendor_order_id uuid, _shelf text DEFAULT NULL)
RETURNS public.vendor_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.vendor_orders;
  v_route text;
  v_shelf text := nullif(trim(coalesce(_shelf, '')), '');
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.vendor_orders WHERE id = _vendor_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  SELECT fulfilment_route INTO v_route FROM public.orders WHERE id = v.order_id;
  IF v_route IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'This order ships straight from the boutique, not through the warehouse';
  END IF;

  IF v.status = 'cancelled' THEN
    -- Cancelled while it was on its way: it goes straight back to the boutique.
    UPDATE public.vendor_orders
    SET arrived_at_warehouse_at = coalesce(arrived_at_warehouse_at, now()),
        received_at_warehouse_at = coalesce(received_at_warehouse_at, now()),
        received_by = coalesce(received_by, auth.uid()),
        warehouse_shelf = coalesce(v_shelf, warehouse_shelf)
    WHERE id = v.id
    RETURNING * INTO v;
    PERFORM public.create_boutique_send_back(v.id, 'order_cancelled', 'Cancelled while on its way to the warehouse');
    RETURN v;
  END IF;

  IF v.status NOT IN ('pending', 'confirmed', 'processing', 'in_transit_to_warehouse', 'at_warehouse') THEN
    RAISE EXCEPTION 'This parcel is already %', replace(v.status, '_', ' ');
  END IF;
  IF v.dispatch_id IS NOT NULL THEN
    RAISE EXCEPTION 'This parcel is already packed for the customer';
  END IF;

  UPDATE public.vendor_orders
  SET status = 'at_warehouse',
      arrived_at_warehouse_at = coalesce(arrived_at_warehouse_at, now()),
      received_at_warehouse_at = coalesce(received_at_warehouse_at, now()),
      received_by = coalesce(received_by, auth.uid()),
      warehouse_shelf = coalesce(v_shelf, warehouse_shelf),
      qc_status = coalesce(qc_status, 'pending')
  WHERE id = v.id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- Inspection result for a boutique's parcel.
CREATE OR REPLACE FUNCTION public.warehouse_record_qc(_vendor_order_id uuid, _passed boolean, _notes text DEFAULT NULL)
RETURNS public.vendor_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.vendor_orders;
  v_notes text := nullif(trim(coalesce(_notes, '')), '');
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.vendor_orders WHERE id = _vendor_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v.received_at_warehouse_at IS NULL OR v.status NOT IN ('at_warehouse', 'qc_failed') THEN
    RAISE EXCEPTION 'Receive this parcel before inspecting it';
  END IF;
  IF v.dispatch_id IS NOT NULL THEN
    RAISE EXCEPTION 'This parcel is already packed for the customer';
  END IF;

  IF _passed THEN
    UPDATE public.vendor_orders
    SET status = 'at_warehouse', qc_status = 'passed', qc_notes = v_notes, qc_at = now(), qc_by = auth.uid()
    WHERE id = v.id
    RETURNING * INTO v;
  ELSE
    IF v_notes IS NULL THEN
      RAISE EXCEPTION 'Describe what is wrong with the item';
    END IF;
    UPDATE public.vendor_orders
    SET status = 'qc_failed', qc_status = 'failed', qc_notes = v_notes, qc_at = now(), qc_by = auth.uid()
    WHERE id = v.id
    RETURNING * INTO v;

    PERFORM public.notify_admins('order', 'warehouse_qc_failed', 'Item failed inspection',
      format('An item in order %s failed inspection: %s. Decide: cancel and refund it, or ask the boutique for a replacement.',
             public.order_ref(v.order_id), v_notes),
      '/warehouse?tab=inspect&focus=' || v.id::text);
    PERFORM public.notify_vendor_members(v.vendor_id, 'warehouse_qc_failed', 'Item failed inspection',
      format('An item you sent for order %s failed our quality check: %s. The AllBoutiqs team will cancel it or ask you for a replacement.',
             public.order_ref(v.order_id), v_notes),
      public.nlink('/vendor', 'orders', v.id));
  END IF;
  RETURN v;
END;
$$;

-- Pack an order: every part must be in and passed. Only an admin may pack
-- part of an order (after the wait limit, "send what has arrived").
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
  IF v_missing > 0 AND NOT (_allow_partial AND public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Not every part of this order is ready. Only an admin can send part of an order.';
  END IF;

  INSERT INTO public.warehouse_dispatches (order_id, warehouse_id, purpose, weight_kg, length_cm, breadth_cm, height_cm, packed_by)
  VALUES (_order_id, v_order.warehouse_id, 'order', _weight_kg, _length_cm, _breadth_cm, _height_cm, auth.uid())
  RETURNING * INTO v_dispatch;

  UPDATE public.vendor_orders SET dispatch_id = v_dispatch.id WHERE id = ANY (_vendor_order_ids);
  RETURN v_dispatch;
END;
$$;

-- Fix the packed parcel's weight/size before it's booked.
CREATE OR REPLACE FUNCTION public.warehouse_update_dispatch_parcel(
  _dispatch_id uuid, _weight_kg numeric, _length_cm numeric, _breadth_cm numeric, _height_cm numeric
)
RETURNS public.warehouse_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  PERFORM public.assert_warehouse_operator();
  IF coalesce(_weight_kg, 0) <= 0 OR coalesce(_length_cm, 0) <= 0 OR coalesce(_breadth_cm, 0) <= 0 OR coalesce(_height_cm, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter the packed parcel''s weight and size';
  END IF;
  UPDATE public.warehouse_dispatches
  SET weight_kg = _weight_kg, length_cm = _length_cm, breadth_cm = _breadth_cm, height_cm = _height_cm
  WHERE id = _dispatch_id AND status = 'packing'
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'Only a parcel that isn''t booked yet can be changed';
  END IF;
  RETURN v;
END;
$$;

-- Unpack (before booking): the parts go back to "ready to pack".
CREATE OR REPLACE FUNCTION public.warehouse_cancel_dispatch(_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'packing' THEN
    RAISE EXCEPTION 'Only a parcel that isn''t booked yet can be unpacked - cancel the courier booking first';
  END IF;
  UPDATE public.vendor_orders SET dispatch_id = NULL WHERE dispatch_id = _dispatch_id;
  UPDATE public.warehouse_dispatches SET status = 'cancelled' WHERE id = _dispatch_id;
END;
$$;

-- A parcel the courier brought back (RTO) is in again; admin then decides to
-- send it again or cancel the order.
CREATE OR REPLACE FUNCTION public.warehouse_receive_rto(_dispatch_id uuid)
RETURNS public.warehouse_dispatches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  PERFORM public.assert_warehouse_operator();
  UPDATE public.warehouse_dispatches
  SET rto_received_at = coalesce(rto_received_at, now())
  WHERE id = _dispatch_id AND status IN ('rto', 'ndr', 'shipped')
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'This parcel isn''t on its way back';
  END IF;
  UPDATE public.warehouse_dispatches SET status = 'rto' WHERE id = _dispatch_id;
  PERFORM public.notify_admins('order', 'warehouse_rto_received', 'Undelivered parcel is back',
    format('The undelivered parcel for order %s is back at the warehouse. Send it again or cancel the order.', public.order_ref(v.order_id)),
    '/warehouse?tab=dispatched&focus=' || v.order_id::text);
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id;
  RETURN v;
END;
$$;

-- Admin: send an undelivered order again (it goes back to "ready to pack").
CREATE OR REPLACE FUNCTION public.admin_redispatch_after_rto(_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can decide this';
  END IF;
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'rto' OR v.rto_received_at IS NULL THEN
    RAISE EXCEPTION 'The parcel must be back at the warehouse first';
  END IF;
  UPDATE public.vendor_orders
  SET status = 'at_warehouse', dispatch_id = NULL
  WHERE dispatch_id = _dispatch_id AND status IN ('returned', 'ndr', 'shipped', 'out_for_delivery');
  UPDATE public.warehouse_dispatches SET status = 'cancelled' WHERE id = _dispatch_id;
END;
$$;

-- A return (or the old item of an exchange) has arrived at the warehouse.
CREATE OR REPLACE FUNCTION public.warehouse_receive_return(_return_request_id uuid, _shelf text DEFAULT NULL)
RETURNS public.return_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.return_requests;
BEGIN
  PERFORM public.assert_warehouse_operator();
  SELECT * INTO v FROM public.return_requests WHERE id = _return_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return request not found';
  END IF;
  IF v.return_destination IS DISTINCT FROM 'warehouse' THEN
    RAISE EXCEPTION 'This return goes straight to the boutique';
  END IF;
  IF v.status NOT IN ('approved', 'pickup_scheduled', 'picked_up', 'pickup_failed', 'at_warehouse') THEN
    RAISE EXCEPTION 'This return is %', replace(v.status, '_', ' ');
  END IF;
  UPDATE public.return_requests
  SET status = 'at_warehouse',
      received_at_warehouse_at = coalesce(received_at_warehouse_at, now()),
      received_by = coalesce(received_by, auth.uid()),
      warehouse_shelf = coalesce(nullif(trim(coalesce(_shelf, '')), ''), warehouse_shelf)
  WHERE id = v.id
  RETURNING * INTO v;
  RETURN v;
END;
$$;

-- An exchange's replacement has arrived from the boutique.
CREATE OR REPLACE FUNCTION public.warehouse_receive_replacement(_return_request_id uuid)
RETURNS public.return_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.return_requests;
BEGIN
  PERFORM public.assert_warehouse_operator();
  UPDATE public.return_requests
  SET replacement_received_at = coalesce(replacement_received_at, now())
  WHERE id = _return_request_id AND request_type = 'exchange' AND return_destination = 'warehouse'
    AND status NOT IN ('rejected', 'cancelled', 'completed', 'replacement_shipped')
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'No open warehouse exchange found for this replacement';
  END IF;
  RETURN v;
END;
$$;

-- Admin: give someone the warehouse staff role, or take it away.
CREATE OR REPLACE FUNCTION public.admin_set_warehouse_staff(_email text, _enabled boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can manage warehouse staff';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(trim(_email));
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No account uses that email yet - ask them to sign up first';
  END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT v_user, 'warehouse_staff'::public.app_role
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND role::text = 'warehouse_staff');
  ELSE
    DELETE FROM public.user_roles WHERE user_id = v_user AND role::text = 'warehouse_staff';
  END IF;
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_warehouse_staff()
RETURNS TABLE (user_id uuid, email text, added_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can see warehouse staff';
  END IF;
  RETURN QUERY
    SELECT ur.user_id, u.email::text, ur.created_at
    FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role::text = 'warehouse_staff'
    ORDER BY ur.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.warehouse_receive_parcel(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_record_qc(uuid, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_create_dispatch(uuid, uuid[], numeric, numeric, numeric, numeric, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_update_dispatch_parcel(uuid, numeric, numeric, numeric, numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_cancel_dispatch(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_receive_rto(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_redispatch_after_rto(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_receive_return(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.warehouse_receive_replacement(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_warehouse_staff(text, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_warehouse_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_parcel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_record_qc(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch(uuid, uuid[], numeric, numeric, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_update_dispatch_parcel(uuid, numeric, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_cancel_dispatch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_rto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_redispatch_after_rto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_return(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_receive_replacement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_warehouse_staff(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_warehouse_staff() TO authenticated;
