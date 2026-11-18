-- AllBoutiqs' own invoice to the customer for what the customer pays
-- AllBoutiqs rather than the boutique (shipping is AllBoutiqs' supply -
-- client, 10 Nov 2026): the Cash on Delivery charge, and a shipping charge
-- while customers are charged one and it isn't the boutique's. One per
-- boutique part (vendor_order) that has any, issued together with the
-- boutique's tax invoice for the goods, so goods invoice + AllBoutiqs
-- invoice = what the customer paid. (The courier & logistics charge is the
-- boutique's to pay, on AllBoutiqs' fee invoice to it - not the customer's.)
--
-- * Numbering: AllBoutiqs' own series per financial year, ABS/2627/00001
--   (fee invoices to boutiques are ABF/...).
-- * Amounts include 18% GST, SAC 996812. Place of supply: the customer's
--   delivery state (CGST + SGST in Gujarat, else IGST) - to be confirmed by
--   the CA.
-- * The COD charge goes on the first AllBoutiqs invoice of the order.
-- * Parts with nothing of AllBoutiqs' on them get none.

CREATE TABLE IF NOT EXISTS public.platform_invoice_series (
  fiscal_year text PRIMARY KEY CHECK (fiscal_year ~ '^[0-9]{4}$'),
  last_serial integer NOT NULL DEFAULT 0
);
ALTER TABLE public.platform_invoice_series ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_order_id uuid NOT NULL UNIQUE REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  -- The boutique's goods invoice it was issued with.
  goods_invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  supplier_name text NOT NULL,
  supplier_gstin text NOT NULL,
  supplier_state_code text NOT NULL,
  billing_name text,
  billing_address jsonb,
  billing_state text,
  place_of_supply_code text,
  supply_type text NOT NULL CHECK (supply_type IN ('intra_state', 'inter_state')),
  sac_code text NOT NULL,
  gst_rate numeric(5,2) NOT NULL,
  -- Each including GST.
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0,
  cod_amount numeric(12,2) NOT NULL DEFAULT 0,
  taxable_value numeric(12,2) NOT NULL,
  cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_order ON public.platform_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_issued ON public.platform_invoices(issued_at);

ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read AllBoutiqs invoices on their orders" ON public.platform_invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = platform_invoices.order_id AND o.user_id = auth.uid()));
CREATE POLICY "Admins read AllBoutiqs invoices" ON public.platform_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.next_platform_invoice_number(_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text := public.fiscal_year_code(_at);
  v_serial integer;
BEGIN
  INSERT INTO platform_invoice_series (fiscal_year, last_serial) VALUES (v_fy, 1)
  ON CONFLICT (fiscal_year) DO UPDATE SET last_serial = platform_invoice_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN 'ABS/' || v_fy || '/' || lpad(v_serial::text, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_platform_invoice_number(timestamptz) FROM public, anon, authenticated;

-- AllBoutiqs' invoice for a boutique part, issued now if it hasn't been.
-- Returns its id, or NULL when there's nothing of AllBoutiqs' on the part.
CREATE OR REPLACE FUNCTION public.issue_platform_invoice(_vendor_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  v_id uuid;
  v_rate numeric := 18;
  v_shipping numeric;
  v_cod numeric;
  v_total numeric;
  v_taxable numeric;
  v_tax numeric;
  v_pos text;
  v_intra boolean;
BEGIN
  SELECT id INTO v_id FROM platform_invoices WHERE vendor_order_id = _vendor_order_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  v_shipping := CASE WHEN coalesce(vo.shipping_to_boutique, false) THEN 0 ELSE coalesce(vo.shipping_cost, 0) END;
  v_cod := CASE WHEN EXISTS (SELECT 1 FROM platform_invoices WHERE order_id = o.id AND cod_amount > 0) THEN 0
                ELSE coalesce(o.cod_charge, 0) END;
  v_total := round(v_shipping + v_cod, 2);
  IF v_total <= 0 THEN RETURN NULL; END IF;

  v_pos := gst_state_code(o.shipping_address->>'state');
  v_intra := v_pos = '24';
  v_taxable := round(v_total / (1 + v_rate / 100), 2);
  v_tax := v_total - v_taxable;

  INSERT INTO platform_invoices (
    invoice_number, order_id, vendor_order_id, goods_invoice_id, issued_at,
    supplier_name, supplier_gstin, supplier_state_code,
    billing_name, billing_address, billing_state, place_of_supply_code, supply_type,
    sac_code, gst_rate, shipping_amount, cod_amount,
    taxable_value, cgst_amount, sgst_amount, igst_amount, total
  ) VALUES (
    next_platform_invoice_number(now()), o.id, vo.id,
    (SELECT i.id FROM invoices i WHERE i.vendor_order_id = vo.id), now(),
    'AllBoutiqs Private Limited', '24ABGCA7307J1ZP', '24',
    o.customer_name, o.shipping_address,
    (SELECT s.name FROM indian_states s WHERE s.gst_code = v_pos), v_pos,
    CASE WHEN v_intra THEN 'intra_state' ELSE 'inter_state' END,
    '996812', v_rate, v_shipping, v_cod,
    v_taxable,
    CASE WHEN v_intra THEN round(v_tax / 2, 2) ELSE 0 END,
    CASE WHEN v_intra THEN v_tax - round(v_tax / 2, 2) ELSE 0 END,
    CASE WHEN v_intra THEN 0 ELSE v_tax END,
    v_total
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_platform_invoice(uuid) FROM public, anon, authenticated;

-- Issued with the boutique's goods invoice. A problem here never stops the
-- goods invoice (and so Ship Now): it is logged, and the part shows up in
-- Admin's reconciliation as "AllBoutiqs invoice missing" until
-- issue_missing_platform_invoices() is run.
CREATE OR REPLACE FUNCTION public.issue_platform_invoice_with_goods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.issue_platform_invoice(NEW.vendor_order_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'AllBoutiqs invoice not issued for boutique order %: %', NEW.vendor_order_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS issue_platform_invoice_with_goods ON public.invoices;
CREATE TRIGGER issue_platform_invoice_with_goods
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.issue_platform_invoice_with_goods();

-- Admins: issue any that are missing (parts whose goods invoice exists).
CREATE OR REPLACE FUNCTION public.issue_missing_platform_invoices()
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
    RAISE EXCEPTION 'Only admins can issue AllBoutiqs invoices';
  END IF;
  FOR r IN
    SELECT i.vendor_order_id FROM invoices i
    WHERE NOT EXISTS (SELECT 1 FROM platform_invoices p WHERE p.vendor_order_id = i.vendor_order_id)
    ORDER BY i.issued_at
  LOOP
    IF public.issue_platform_invoice(r.vendor_order_id) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_missing_platform_invoices() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_missing_platform_invoices() TO authenticated;
