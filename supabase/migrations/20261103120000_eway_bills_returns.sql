-- E-way bills, part 2: returns, RTO, send-backs, exchanges and replacements
-- (the document chain agreed with the CA, Nov 2026). The rule: the movement
-- that starts a sale or a return travels on the tax invoice / return
-- invoice; a movement on from the warehouse travels on a delivery challan.
--
--   customer -> warehouse (return, exchange)    return invoice
--   warehouse -> boutique (customer return)     delivery challan
--   warehouse -> customer (return failed QC)    delivery challan; the return
--                                               invoice is cancelled
--   customer -> warehouse (RTO)                 return invoice (cancelled if
--                                               the parcel is sent again)
--   warehouse -> boutique (after RTO)           delivery challan
--   warehouse -> boutique (failed inspection,   return invoice
--     cancelled at the warehouse)
--   boutique -> warehouse (replacement after a  new tax invoice
--     failed inspection, exchange replacement)
--   warehouse -> customer (exchange)            delivery challan
--
-- Return invoices are issued for every return / reversal after the goods
-- were invoiced, whatever the value (the CA's instruction); challans and
-- e-way bills only when the value is over the limit.

-- ---------- tax invoices: more than one per part ----------

-- A replacement after a failed inspection, and an exchange's replacement,
-- each go out on a new invoice. The original sale stays one per part.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_vendor_order_id_key;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'sale' CHECK (purpose IN ('sale', 'replacement', 'exchange')),
  ADD COLUMN IF NOT EXISTS return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_sale_per_part ON public.invoices(vendor_order_id) WHERE purpose = 'sale';
CREATE INDEX IF NOT EXISTS idx_invoices_vendor_order ON public.invoices(vendor_order_id);

-- ---------- numbering ----------

ALTER TABLE public.boutique_document_series DROP CONSTRAINT IF EXISTS boutique_document_series_doc_kind_check;
ALTER TABLE public.boutique_document_series
  ADD CONSTRAINT boutique_document_series_doc_kind_check CHECK (doc_kind IN ('delivery_challan', 'return_invoice'));

-- AB0001C2627/0001 (challan), AB0001R2627/0001 (return invoice): boutique
-- code, kind, financial year, serial - 16 characters, the e-way bill's
-- document-number limit.
CREATE OR REPLACE FUNCTION public.next_boutique_document_number(_vendor_id uuid, _doc_kind text, _at timestamptz)
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
  VALUES (_vendor_id, _doc_kind, v_fy, 1)
  ON CONFLICT (vendor_id, doc_kind, fiscal_year) DO UPDATE SET last_serial = boutique_document_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN v_code || CASE _doc_kind WHEN 'return_invoice' THEN 'R' ELSE 'C' END || v_fy || '/' || lpad(v_serial::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_boutique_document_number(uuid, text, timestamptz) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_boutique_challan_number(_vendor_id uuid, _at timestamptz)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.next_boutique_document_number(_vendor_id, 'delivery_challan', _at);
$$;
REVOKE ALL ON FUNCTION public.next_boutique_challan_number(uuid, timestamptz) FROM public, anon, authenticated;

-- ---------- return invoices ----------

-- The boutique's return invoice: it takes back (part of) a tax invoice -
-- the returned items, or all of it when the sale is undone before the
-- customer has the goods. Lines are the tax invoice's, for the quantity
-- taken back.
CREATE TABLE IF NOT EXISTS public.return_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_invoice_number text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  -- customer_return / exchange_return: items the customer sent back;
  -- rto: the courier couldn't deliver; qc_failed: failed the warehouse
  -- inspection; order_cancelled: cancelled after it left the boutique;
  -- replacement_returned: an exchange replacement going back unused.
  reason text NOT NULL CHECK (reason IN ('customer_return', 'exchange_return', 'rto', 'qc_failed', 'order_cancelled', 'replacement_returned')),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancel_reason text,
  taxable_value numeric(12,2) NOT NULL,
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One standing return invoice per tax invoice, reason and return request.
CREATE UNIQUE INDEX IF NOT EXISTS return_invoices_one_issued
  ON public.return_invoices(invoice_id, reason, coalesce(return_request_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'issued';
CREATE INDEX IF NOT EXISTS idx_return_invoices_vendor_order ON public.return_invoices(vendor_order_id);
CREATE INDEX IF NOT EXISTS idx_return_invoices_return_request ON public.return_invoices(return_request_id);

CREATE TABLE IF NOT EXISTS public.return_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_invoice_id uuid NOT NULL REFERENCES public.return_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  order_item_id uuid,
  description text NOT NULL,
  hsn_code text,
  size text,
  color text,
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  taxable_value numeric(12,2) NOT NULL,
  gst_rate numeric(5,2) NOT NULL,
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  UNIQUE (return_invoice_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_return_invoice_lines_return_invoice ON public.return_invoice_lines(return_invoice_id);

ALTER TABLE public.return_invoices ENABLE ROW LEVEL SECURITY;
-- Written only by the edge functions (service role).
CREATE POLICY "Customers, boutique members, admins and warehouse read return invoices"
  ON public.return_invoices FOR SELECT TO authenticated
  USING (
    public.is_vendor_member(auth.uid(), vendor_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.can_operate_warehouse(auth.uid())
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = return_invoices.order_id AND o.user_id = auth.uid())
  );

ALTER TABLE public.return_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Return invoice lines follow their return invoice"
  ON public.return_invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.return_invoices r WHERE r.id = return_invoice_lines.return_invoice_id));

-- A full reversal (the sale undone before the customer has the goods)
-- retires the tax invoice: a later shipment of the part needs a new one.
CREATE OR REPLACE FUNCTION public.invoice_is_reversed(_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM return_invoices r
    WHERE r.invoice_id = _invoice_id AND r.status = 'issued'
      AND r.reason IN ('rto', 'qc_failed', 'order_cancelled', 'replacement_returned')
  );
$$;
REVOKE ALL ON FUNCTION public.invoice_is_reversed(uuid) FROM public, anon, authenticated;

-- The return invoice a send-back to the boutique travels on (or, for goods
-- the customer returned, the one its challan refers to). Set when the
-- send-back is decided; found or issued at booking otherwise.
ALTER TABLE public.boutique_send_backs
  ADD COLUMN IF NOT EXISTS return_invoice_id uuid REFERENCES public.return_invoices(id) ON DELETE SET NULL;

-- ---------- delivery challans: also for returns ----------

-- A challan travels with goods already covered by a tax invoice (onward to
-- the customer) or by a return invoice (onward to the boutique, or back to
-- the customer when a return failed inspection - its lines are the
-- cancelled return invoice's).
ALTER TABLE public.delivery_challans ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS return_invoice_id uuid REFERENCES public.return_invoices(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'to_customer'
    CHECK (purpose IN ('to_customer', 'return_to_customer', 'to_boutique')),
  ADD COLUMN IF NOT EXISTS return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_id uuid REFERENCES public.boutique_send_backs(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_challans DROP CONSTRAINT IF EXISTS delivery_challans_document_check;
ALTER TABLE public.delivery_challans
  ADD CONSTRAINT delivery_challans_document_check CHECK (invoice_id IS NOT NULL OR return_invoice_id IS NOT NULL);

-- ---------- e-way bills: the new movements ----------

ALTER TABLE public.eway_bills DROP CONSTRAINT IF EXISTS eway_bills_leg_check;
ALTER TABLE public.eway_bills ADD CONSTRAINT eway_bills_leg_check CHECK (leg IN (
  'boutique_to_customer', 'boutique_to_warehouse', 'warehouse_to_customer',
  'customer_to_warehouse', 'customer_to_boutique', 'warehouse_to_boutique'));
ALTER TABLE public.eway_bills DROP CONSTRAINT IF EXISTS eway_bills_document_type_check;
ALTER TABLE public.eway_bills ADD CONSTRAINT eway_bills_document_type_check
  CHECK (document_type IN ('tax_invoice', 'delivery_challan', 'return_invoice'));

ALTER TABLE public.eway_bills
  -- Which movement of the part this is, so one leg can be travelled more
  -- than once: 'order', 'return:<request>', 'exchange:<request>',
  -- 'sendback:<send-back>', 'rto:<shipment>'.
  ADD COLUMN IF NOT EXISTS movement text NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS return_invoice_id uuid REFERENCES public.return_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_id uuid REFERENCES public.boutique_send_backs(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.eway_bills_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS eway_bills_one_pending ON public.eway_bills(vendor_order_id, leg, movement) WHERE status = 'pending';

-- ---------- the value the limit is checked on ----------

-- As before, but with several invoices per part: the newest one still
-- standing (a reversed invoice no longer counts).
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
    (SELECT i.total FROM invoices i
     WHERE i.vendor_order_id = _vendor_order_id
       AND i.purpose IN ('sale', 'replacement')
       AND NOT public.invoice_is_reversed(i.id)
     ORDER BY i.issued_at DESC
     LIMIT 1),
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

-- ---------- sending a parcel again after RTO ----------

-- The goods are going back to the customer after all: the return invoice
-- the RTO was booked on is withdrawn (and any e-way bill still asked for it).
CREATE OR REPLACE FUNCTION public.admin_redispatch_after_rto(_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.warehouse_dispatches;
  v_parts uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can decide this';
  END IF;
  SELECT * INTO v FROM public.warehouse_dispatches WHERE id = _dispatch_id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'rto' OR v.rto_received_at IS NULL THEN
    RAISE EXCEPTION 'The parcel must be back at the warehouse first';
  END IF;
  SELECT array_agg(id) INTO v_parts FROM public.vendor_orders WHERE dispatch_id = _dispatch_id;
  UPDATE public.vendor_orders
  SET status = 'at_warehouse', dispatch_id = NULL
  WHERE dispatch_id = _dispatch_id AND status IN ('returned', 'ndr', 'shipped', 'out_for_delivery');
  UPDATE public.warehouse_dispatches SET status = 'cancelled' WHERE id = _dispatch_id;

  UPDATE public.return_invoices
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Sent to the customer again'
  WHERE vendor_order_id = ANY(coalesce(v_parts, '{}')) AND reason = 'rto' AND status = 'issued';
  UPDATE public.eway_bills
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Sent to the customer again'
  WHERE vendor_order_id = ANY(coalesce(v_parts, '{}')) AND movement LIKE 'rto:%' AND status = 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_redispatch_after_rto(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_redispatch_after_rto(uuid) TO authenticated;
