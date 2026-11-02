-- E-way bills (CGST rule 138) for parcels worth more than ₹50,000 - the limit
-- is an admin setting. Agreed with the CA (Nov 2026):
-- * the value is per boutique invoice: its total with GST and the delivery
--   charge, after the coupon;
-- * every movement needs its own e-way bill on its own document:
--     boutique -> customer (direct route)      tax invoice
--     boutique -> warehouse (warehouse route)  tax invoice: bill to the
--                                              customer, ship to the warehouse
--     warehouse -> customer                    delivery challan: bill from the
--                                              boutique, dispatch from the warehouse
--   (returns, RTO and send-backs follow with the return invoice);
-- * AllBoutiqs makes them on the government portal (no API yet) through a
--   sub-user each boutique creates for it. A boutique that won't create one
--   makes its own and emails the number. An admin types the number in, and
--   until then the courier can't be booked (shiprocket-create-shipment and
--   warehouse-actions check it, _shared/ewayBill.ts).

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS eway_bill_threshold numeric(12,2) NOT NULL DEFAULT 50000
    CHECK (eway_bill_threshold >= 0),
  -- Where a boutique that makes its own e-way bills sends the number.
  ADD COLUMN IF NOT EXISTS eway_bill_email text NOT NULL DEFAULT 'support@allboutiqs.com',
  -- The mobile a boutique puts on the sub-user it creates for AllBoutiqs,
  -- so the portal's sign-in codes come to AllBoutiqs.
  ADD COLUMN IF NOT EXISTS eway_bill_subuser_mobile text;

-- ---------- each boutique's portal set-up ----------

CREATE TABLE IF NOT EXISTS public.vendor_eway_bill_setup (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(id) ON DELETE CASCADE,
  -- subuser: AllBoutiqs makes them through the sub-user the boutique created;
  -- self: the boutique refused one, makes its own and emails the number.
  mode text NOT NULL DEFAULT 'subuser' CHECK (mode IN ('subuser', 'self')),
  subuser_username text CHECK (subuser_username IS NULL OR length(subuser_username) BETWEEN 1 AND 60),
  submitted_at timestamptz,
  -- An admin signed in with the sub-user once and it works.
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  admin_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_eway_bill_setup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boutique members and admins read e-way bill setup"
  ON public.vendor_eway_bill_setup FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage e-way bill setup"
  ON public.vendor_eway_bill_setup FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vendor_eway_bill_setup_updated_at
  BEFORE UPDATE ON public.vendor_eway_bill_setup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The boutique fills in the sub-user it created. A changed name has to be
-- checked by an admin again.
CREATE OR REPLACE FUNCTION public.save_eway_bill_subuser(_vendor_id uuid, _username text)
RETURNS public.vendor_eway_bill_setup
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := nullif(btrim(coalesce(_username, '')), '');
  v_row public.vendor_eway_bill_setup;
BEGIN
  IF NOT (public.is_vendor_member(auth.uid(), _vendor_id) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only this boutique''s team can do this';
  END IF;
  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Enter the sub-user name you created on the e-way bill portal';
  END IF;
  INSERT INTO public.vendor_eway_bill_setup AS s (vendor_id, subuser_username, submitted_at)
  VALUES (_vendor_id, v_username, now())
  ON CONFLICT (vendor_id) DO UPDATE SET
    subuser_username = EXCLUDED.subuser_username,
    submitted_at = now(),
    verified_at = CASE WHEN s.subuser_username IS DISTINCT FROM EXCLUDED.subuser_username THEN NULL ELSE s.verified_at END,
    verified_by = CASE WHEN s.subuser_username IS DISTINCT FROM EXCLUDED.subuser_username THEN NULL ELSE s.verified_by END
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_eway_bill_subuser(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_eway_bill_subuser(uuid, text) TO authenticated;

-- ---------- couriers' transporter IDs ----------

-- Part B of an e-way bill names the transporter by its GST transporter ID.
-- Shiprocket doesn't give it, so an admin enters it once per courier.
-- Couriers' IDs are public business details, so any signed-in user may read
-- them (a boutique making its own e-way bill needs it too).
CREATE TABLE IF NOT EXISTS public.courier_transporters (
  courier_id integer PRIMARY KEY,
  courier_name text NOT NULL,
  transporter_id text NOT NULL CHECK (transporter_id ~ '^[0-9A-Z]{15}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.courier_transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read courier transporter IDs"
  ON public.courier_transporters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage courier transporter IDs"
  ON public.courier_transporters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_courier_transporters_updated_at
  BEFORE UPDATE ON public.courier_transporters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- invoice: ship-to ----------

-- On the warehouse route the invoice is billed to the customer and shipped
-- to the warehouse (the goods leave the boutique on it). Null = ship to the
-- billing address.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ship_to_name text,
  ADD COLUMN IF NOT EXISTS ship_to_address jsonb;

-- Warehouse staff print the delivery challan, which shows the invoice's lines.
CREATE POLICY "Warehouse reads invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));

-- ---------- delivery challan (warehouse -> customer) ----------

-- Per-boutique, per-kind, per-financial-year counters for documents other
-- than the tax invoice (which keeps invoice_series).
CREATE TABLE IF NOT EXISTS public.boutique_document_series (
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  doc_kind text NOT NULL CHECK (doc_kind IN ('delivery_challan')),
  fiscal_year text NOT NULL CHECK (fiscal_year ~ '^[0-9]{4}$'),
  last_serial integer NOT NULL DEFAULT 0,
  PRIMARY KEY (vendor_id, doc_kind, fiscal_year)
);
ALTER TABLE public.boutique_document_series ENABLE ROW LEVEL SECURITY;

-- AB0001C2627/0001: boutique code, C for challan, financial year, serial -
-- 16 characters, the e-way bill's document-number limit.
CREATE OR REPLACE FUNCTION public.next_boutique_challan_number(_vendor_id uuid, _at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_fy text := public.fiscal_year_code(_at);
  v_serial integer;
BEGIN
  SELECT boutique_code INTO v_code FROM vendors WHERE id = _vendor_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Boutique % has no boutique code', _vendor_id;
  END IF;
  INSERT INTO boutique_document_series (vendor_id, doc_kind, fiscal_year, last_serial)
  VALUES (_vendor_id, 'delivery_challan', v_fy, 1)
  ON CONFLICT (vendor_id, doc_kind, fiscal_year) DO UPDATE SET last_serial = boutique_document_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN v_code || 'C' || v_fy || '/' || lpad(v_serial::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_boutique_challan_number(uuid, timestamptz) FROM public, anon, authenticated;

-- The goods were already invoiced to the customer (on the boutique -> warehouse
-- leg); the challan is the document they travel on from the warehouse. The
-- lines are the invoice's.
CREATE TABLE IF NOT EXISTS public.delivery_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text NOT NULL UNIQUE,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  dispatch_id uuid REFERENCES public.warehouse_dispatches(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  dispatch_from_name text NOT NULL,
  dispatch_from_address jsonb NOT NULL,
  ship_to_name text NOT NULL,
  ship_to_address jsonb NOT NULL,
  value numeric(12,2) NOT NULL,
  reason text NOT NULL DEFAULT 'Delivery of goods already invoiced to the customer',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_vendor_order ON public.delivery_challans(vendor_order_id);

ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boutique members, admins and warehouse read delivery challans"
  ON public.delivery_challans FOR SELECT TO authenticated
  USING (
    public.is_vendor_member(auth.uid(), vendor_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.can_operate_warehouse(auth.uid())
  );

-- ---------- e-way bills ----------

CREATE TABLE IF NOT EXISTS public.eway_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  leg text NOT NULL CHECK (leg IN ('boutique_to_customer', 'boutique_to_warehouse', 'warehouse_to_customer')),
  document_type text NOT NULL CHECK (document_type IN ('tax_invoice', 'delivery_challan')),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  challan_id uuid REFERENCES public.delivery_challans(id) ON DELETE SET NULL,
  document_number text NOT NULL,
  document_date date NOT NULL,
  -- The consignment value: the invoice total (GST and delivery charge included).
  value numeric(12,2) NOT NULL,
  -- Dispatch from / ship to, as they go on the e-way bill.
  from_name text NOT NULL,
  from_address jsonb NOT NULL,
  to_name text NOT NULL,
  to_address jsonb NOT NULL,
  -- The courier the e-way bill is made out to; the booking must use it.
  courier_id integer,
  courier_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled')),
  ewb_number text CHECK (ewb_number ~ '^[0-9]{12}$'),
  ewb_date timestamptz,
  valid_until timestamptz,
  entered_by uuid REFERENCES auth.users(id),
  entered_at timestamptz,
  -- The booking that used it. Until then (or if that booking is cancelled)
  -- the next booking of this leg uses it.
  shipment_id uuid REFERENCES public.shipments(id) ON DELETE SET NULL,
  dispatch_id uuid REFERENCES public.warehouse_dispatches(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR ewb_number IS NOT NULL)
);

-- A number belongs to one parcel (a cancelled one can be typed in again).
CREATE UNIQUE INDEX IF NOT EXISTS eway_bills_number_key ON public.eway_bills(ewb_number) WHERE status <> 'cancelled';
-- One open request per part and leg.
CREATE UNIQUE INDEX IF NOT EXISTS eway_bills_one_pending ON public.eway_bills(vendor_order_id, leg) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_eway_bills_vendor_order ON public.eway_bills(vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_eway_bills_status ON public.eway_bills(status, created_at);
CREATE INDEX IF NOT EXISTS idx_eway_bills_shipment ON public.eway_bills(shipment_id);

ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;
-- Written only by the edge functions (service role).
CREATE POLICY "Boutique members, admins and warehouse read e-way bills"
  ON public.eway_bills FOR SELECT TO authenticated
  USING (
    public.is_vendor_member(auth.uid(), vendor_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.can_operate_warehouse(auth.uid())
  );

CREATE TRIGGER update_eway_bills_updated_at
  BEFORE UPDATE ON public.eway_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A cancelled part no longer needs the e-way bill it was waiting for. One
-- already made stays active: it has to be cancelled on the portal too, so an
-- admin closes it by hand.
CREATE OR REPLACE FUNCTION public.close_eway_bill_requests_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE eway_bills
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'The order part was cancelled'
    WHERE vendor_order_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS close_eway_bill_requests_on_cancel ON public.vendor_orders;
CREATE TRIGGER close_eway_bill_requests_on_cancel
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.close_eway_bill_requests_on_cancel();

-- ---------- the value the limit is checked on ----------

-- What the boutique's invoice for this part comes to - or will, before it is
-- issued: its items less their coupon share (checkout's per-line share, or on
-- older orders the order's discount shared by value), plus its delivery
-- charge. The same sums generate-invoice makes.
CREATE OR REPLACE FUNCTION public.vendor_order_invoice_value(_vendor_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH part AS (
    SELECT coalesce(vo.shipping_cost, 0) AS shipping,
           o.subtotal AS order_gross,
           coalesce(o.discount_amount, 0) AS order_discount
    FROM vendor_orders vo
    JOIN orders o ON o.id = vo.order_id
    WHERE vo.id = _vendor_order_id
  ),
  lines AS (
    SELECT oi.price * oi.quantity AS gross, oi.discount_amount
    FROM order_items oi
    WHERE oi.vendor_order_id = _vendor_order_id
  ),
  base AS (
    SELECT coalesce(nullif((SELECT order_gross FROM part), 0), (SELECT sum(gross) FROM lines)) AS gross
  )
  SELECT coalesce(
    (SELECT i.total FROM invoices i WHERE i.vendor_order_id = _vendor_order_id),
    (SELECT round(
       coalesce(sum(l.gross - coalesce(
         l.discount_amount,
         CASE WHEN b.gross > 0 THEN round((SELECT order_discount FROM part) * l.gross / b.gross, 2) ELSE 0 END
       )), 0) + (SELECT shipping FROM part),
       2)
     FROM lines l, base b)
  );
$$;
REVOKE ALL ON FUNCTION public.vendor_order_invoice_value(uuid) FROM public, anon, authenticated;

-- For the order lists: which of these parts need an e-way bill and what
-- their invoice comes to - only parts the caller works on.
CREATE OR REPLACE FUNCTION public.eway_bill_requirements(_vendor_order_ids uuid[])
RETURNS TABLE (vendor_order_id uuid, invoice_value numeric, required boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vo.id, v.value, v.value > s.eway_bill_threshold
  FROM vendor_orders vo
  CROSS JOIN LATERAL (SELECT public.vendor_order_invoice_value(vo.id) AS value) v
  CROSS JOIN (SELECT eway_bill_threshold FROM platform_settings LIMIT 1) s
  WHERE vo.id = ANY(_vendor_order_ids)
    AND (
      public.is_vendor_member(auth.uid(), vo.vendor_id)
      OR public.has_role(auth.uid(), 'admin')
      OR public.can_operate_warehouse(auth.uid())
    );
$$;
REVOKE ALL ON FUNCTION public.eway_bill_requirements(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.eway_bill_requirements(uuid[]) TO authenticated;
