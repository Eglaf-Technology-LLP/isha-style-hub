-- Credit notes (GST section 34) on the boutique's customer tax invoices,
-- issued in the boutique's name by AllBoutiqs on its behalf, like the
-- invoices - so the boutique's GSTR-1 shows the sale reduced when goods come
-- back:
--   * a return completed (refund done): the returned pieces;
--   * a part cancelled or back undelivered after its invoice was issued:
--     everything on the invoice not credited yet.
-- Each credit note line takes its amounts from the invoice line it credits
-- (per piece; the last pieces get exactly what is left, so the invoice and
-- its credit notes always net to 0). A line is never credited twice.
--
-- * Numbering: the boutique's own series, new every financial year,
--   <boutique code>/<FY>/C<serial>, e.g. AB0001/2627/C001 (16 characters).
-- * Issued by triggers; a problem never blocks the return or cancellation
--   (logged) and issue_missing_credit_notes() issues any that are missing.

CREATE TABLE IF NOT EXISTS public.credit_note_series (
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  fiscal_year text NOT NULL CHECK (fiscal_year ~ '^[0-9]{4}$'),
  last_serial integer NOT NULL DEFAULT 0,
  PRIMARY KEY (vendor_id, fiscal_year)
);
ALTER TABLE public.credit_note_series ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  vendor_order_id uuid NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('return', 'cancelled', 'undelivered')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  -- The invoice it reduces (snapshot).
  invoice_number text NOT NULL,
  invoice_date timestamptz NOT NULL,
  invoice_total numeric(12,2) NOT NULL,
  seller_name text NOT NULL,
  seller_legal_name text,
  seller_gstin text,
  seller_state_code text,
  billing_name text,
  billing_state text,
  place_of_supply_code text,
  supply_type text,
  taxable_value numeric(12,2) NOT NULL,
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_vendor ON public.credit_notes(vendor_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_one_per_return_part
  ON public.credit_notes(return_request_id, vendor_order_id) WHERE return_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines(id) ON DELETE CASCADE,
  order_item_id uuid,
  description text NOT NULL,
  hsn_code text,
  quantity integer NOT NULL,
  taxable_value numeric(12,2) NOT NULL,
  gst_rate numeric(5,2) NOT NULL,
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  UNIQUE (credit_note_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_invoice_line ON public.credit_note_lines(invoice_line_id);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boutiques read their credit notes" ON public.credit_notes FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id));
CREATE POLICY "Admins read credit notes" ON public.credit_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Customers read credit notes on their orders" ON public.credit_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = credit_notes.order_id AND o.user_id = auth.uid()));
CREATE POLICY "Credit note lines follow their note" ON public.credit_note_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_lines.credit_note_id));

CREATE OR REPLACE FUNCTION public.next_credit_note_number(_vendor_id uuid, _at timestamptz)
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
  INSERT INTO credit_note_series (vendor_id, fiscal_year, last_serial) VALUES (_vendor_id, v_fy, 1)
  ON CONFLICT (vendor_id, fiscal_year) DO UPDATE SET last_serial = credit_note_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN v_code || '/' || v_fy || '/C' || lpad(v_serial::text, 3, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_credit_note_number(uuid, timestamptz) FROM public, anon, authenticated;

-- A credit note on a boutique part's invoice. _pieces: {order_item_id:
-- pieces} for a return; NULL = everything not credited yet (cancelled /
-- undelivered). Returns its id, or NULL when there's nothing to credit.
CREATE OR REPLACE FUNCTION public.issue_credit_note(
  _vendor_order_id uuid,
  _reason text,
  _return_request_id uuid DEFAULT NULL,
  _pieces jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.invoices;
  l record;
  v_qty integer;
  v_lines jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_full boolean;
  v_taxable numeric; v_cgst numeric; v_sgst numeric; v_igst numeric; v_total numeric;
  v_id uuid;
BEGIN
  IF _return_request_id IS NOT NULL THEN
    SELECT id INTO v_id FROM credit_notes WHERE return_request_id = _return_request_id AND vendor_order_id = _vendor_order_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  SELECT * INTO i FROM invoices WHERE vendor_order_id = _vendor_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  FOR l IN
    SELECT il.*,
           coalesce((SELECT sum(c.quantity) FROM credit_note_lines c WHERE c.invoice_line_id = il.id), 0) AS q_done,
           coalesce((SELECT sum(c.taxable_value) FROM credit_note_lines c WHERE c.invoice_line_id = il.id), 0) AS t_done,
           coalesce((SELECT sum(c.cgst_amount) FROM credit_note_lines c WHERE c.invoice_line_id = il.id), 0) AS c_done,
           coalesce((SELECT sum(c.sgst_amount) FROM credit_note_lines c WHERE c.invoice_line_id = il.id), 0) AS s_done,
           coalesce((SELECT sum(c.igst_amount) FROM credit_note_lines c WHERE c.invoice_line_id = il.id), 0) AS g_done,
           coalesce((SELECT sum(c.total) FROM credit_note_lines c WHERE c.invoice_line_id = il.id), 0) AS tot_done
    FROM invoice_lines il WHERE il.invoice_id = i.id ORDER BY il.line_no
  LOOP
    v_qty := l.quantity - l.q_done;
    IF _pieces IS NOT NULL THEN
      v_qty := least(v_qty, coalesce((_pieces->>(l.order_item_id::text))::integer, 0));
    END IF;
    CONTINUE WHEN v_qty <= 0;
    -- The last pieces of a line take exactly what's left of it.
    v_full := v_qty = l.quantity - l.q_done;
    v_taxable := CASE WHEN v_full THEN l.taxable_value - l.t_done ELSE round(l.taxable_value * v_qty / l.quantity, 2) END;
    v_cgst := CASE WHEN v_full THEN l.cgst_amount - l.c_done ELSE round(l.cgst_amount * v_qty / l.quantity, 2) END;
    v_sgst := CASE WHEN v_full THEN l.sgst_amount - l.s_done ELSE round(l.sgst_amount * v_qty / l.quantity, 2) END;
    v_igst := CASE WHEN v_full THEN l.igst_amount - l.g_done ELSE round(l.igst_amount * v_qty / l.quantity, 2) END;
    v_total := CASE WHEN v_full THEN l.total - l.tot_done ELSE v_taxable + v_cgst + v_sgst + v_igst END;
    v_n := v_n + 1;
    v_lines := v_lines || jsonb_build_object(
      'line_no', v_n, 'invoice_line_id', l.id, 'order_item_id', l.order_item_id, 'description', l.description,
      'hsn_code', l.hsn_code, 'quantity', v_qty, 'taxable_value', v_taxable, 'gst_rate', l.gst_rate,
      'cgst_amount', v_cgst, 'sgst_amount', v_sgst, 'igst_amount', v_igst, 'total', v_total);
  END LOOP;
  IF v_n = 0 THEN RETURN NULL; END IF;

  INSERT INTO credit_notes (
    credit_note_number, invoice_id, vendor_id, vendor_order_id, order_id, return_request_id, reason, issued_at,
    invoice_number, invoice_date, invoice_total, seller_name, seller_legal_name, seller_gstin, seller_state_code,
    billing_name, billing_state, place_of_supply_code, supply_type,
    taxable_value, cgst_amount, sgst_amount, igst_amount, total
  )
  SELECT next_credit_note_number(i.vendor_id, now()), i.id, i.vendor_id, i.vendor_order_id, i.order_id, _return_request_id,
         _reason, now(), i.invoice_number, i.issued_at, i.total, i.seller_name, i.seller_legal_name, i.seller_gstin,
         i.seller_state_code, i.billing_name, i.billing_state, i.place_of_supply_code, i.supply_type,
         sum((x->>'taxable_value')::numeric), sum((x->>'cgst_amount')::numeric), sum((x->>'sgst_amount')::numeric),
         sum((x->>'igst_amount')::numeric), sum((x->>'total')::numeric)
  FROM jsonb_array_elements(v_lines) x
  RETURNING id INTO v_id;

  INSERT INTO credit_note_lines (credit_note_id, line_no, invoice_line_id, order_item_id, description, hsn_code, quantity,
                                 taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total)
  SELECT v_id, (x->>'line_no')::integer, (x->>'invoice_line_id')::uuid, nullif(x->>'order_item_id', '')::uuid,
         x->>'description', x->>'hsn_code', (x->>'quantity')::integer, (x->>'taxable_value')::numeric,
         (x->>'gst_rate')::numeric, (x->>'cgst_amount')::numeric, (x->>'sgst_amount')::numeric,
         (x->>'igst_amount')::numeric, (x->>'total')::numeric
  FROM jsonb_array_elements(v_lines) x;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_credit_note(uuid, text, uuid, jsonb) FROM public, anon, authenticated;

-- The credit notes for a completed return: one per boutique part.
CREATE OR REPLACE FUNCTION public.issue_return_credit_notes(_return_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT oi.vendor_order_id,
           jsonb_object_agg(oi.id::text, coalesce((e->>'quantity')::integer, oi.quantity)) AS pieces
    FROM return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) e
    JOIN order_items oi ON oi.id::text = e->>'order_item_id'
    WHERE rr.id = _return_request_id AND rr.request_type = 'return' AND rr.status = 'completed'
      AND oi.vendor_order_id IS NOT NULL
    GROUP BY oi.vendor_order_id
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM credit_notes c
                          WHERE c.return_request_id = _return_request_id AND c.vendor_order_id = r.vendor_order_id);
    IF public.issue_credit_note(r.vendor_order_id, 'return', _return_request_id, r.pieces) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_return_credit_notes(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.credit_note_on_return_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.issue_return_credit_notes(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Credit note not issued for return %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS credit_note_on_return_completed ON public.return_requests;
CREATE TRIGGER credit_note_on_return_completed
  AFTER UPDATE OF status ON public.return_requests
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.request_type = 'return')
  EXECUTE FUNCTION public.credit_note_on_return_completed();

CREATE OR REPLACE FUNCTION public.credit_note_on_part_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.issue_credit_note(NEW.id,
      CASE WHEN NEW.status = 'returned' OR NEW.logistics_kept THEN 'undelivered' ELSE 'cancelled' END);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Credit note not issued for boutique order %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS credit_note_on_part_cancelled ON public.vendor_orders;
CREATE TRIGGER credit_note_on_part_cancelled
  AFTER UPDATE OF status ON public.vendor_orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled', 'returned'))
  EXECUTE FUNCTION public.credit_note_on_part_cancelled();

-- Admins: issue any credit notes that are missing - completed returns, and
-- cancelled / undelivered parts with an invoice not fully credited.
CREATE OR REPLACE FUNCTION public.issue_missing_credit_notes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can issue credit notes';
  END IF;
  FOR r IN SELECT id FROM return_requests WHERE request_type = 'return' AND status = 'completed' ORDER BY updated_at LOOP
    v_count := v_count + public.issue_return_credit_notes(r.id);
  END LOOP;
  FOR r IN
    SELECT vo.id, vo.status, vo.logistics_kept FROM vendor_orders vo
    WHERE vo.status IN ('cancelled', 'returned') AND EXISTS (SELECT 1 FROM invoices i WHERE i.vendor_order_id = vo.id)
  LOOP
    IF public.issue_credit_note(r.id, CASE WHEN r.status = 'returned' OR r.logistics_kept THEN 'undelivered' ELSE 'cancelled' END) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_missing_credit_notes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_missing_credit_notes() TO authenticated;

-- Anything already returned or cancelled on live gets its credit note now.
SELECT public.issue_missing_credit_notes();
