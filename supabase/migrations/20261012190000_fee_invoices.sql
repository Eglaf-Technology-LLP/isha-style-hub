-- AllBoutiqs fee invoice (step 10): AllBoutiqs Private Limited -> boutique,
-- one per boutique per payout day, with the payout. Lines: marketplace
-- commission and technology & service fee (as worked out on each order),
-- GST at the fee rate (18%), SAC 998599: boutique registered in Gujarat ->
-- CGST + SGST, other state -> IGST. Own number series per financial year:
-- ABF/2627/00001.

CREATE TABLE IF NOT EXISTS public.fee_invoice_series (
  fiscal_year text PRIMARY KEY CHECK (fiscal_year ~ '^[0-9]{4}$'),
  last_serial integer NOT NULL DEFAULT 0
);
ALTER TABLE public.fee_invoice_series ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  payout_date date NOT NULL,
  period_start date,
  period_end date,
  issued_at timestamptz NOT NULL DEFAULT now(),
  supplier_name text NOT NULL,
  supplier_gstin text NOT NULL,
  supplier_cin text NOT NULL,
  supplier_state_code text NOT NULL,
  recipient_name text NOT NULL,
  recipient_legal_name text,
  recipient_gstin text,
  recipient_pan text,
  recipient_address jsonb,
  recipient_state_code text,
  supply_type text NOT NULL CHECK (supply_type IN ('intra_state', 'inter_state')),
  sac_code text NOT NULL,
  order_count integer NOT NULL,
  product_value numeric(14,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  tech_fee_amount numeric(14,2) NOT NULL,
  taxable_value numeric(14,2) NOT NULL,
  gst_rate numeric(5,2) NOT NULL,
  cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL,
  -- Commission waived for a Founding Boutique on some/all of these orders.
  founding_waiver boolean NOT NULL DEFAULT false,
  vendor_order_ids uuid[] NOT NULL,
  UNIQUE (vendor_id, payout_date)
);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_vendor ON public.fee_invoices(vendor_id, payout_date DESC);

ALTER TABLE public.fee_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Boutiques and admins read fee invoices" ON public.fee_invoices FOR SELECT TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.vendor_orders
  ADD COLUMN IF NOT EXISTS fee_invoice_id uuid REFERENCES public.fee_invoices(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.next_fee_invoice_number(_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text := public.fiscal_year_code(_at);
  v_serial integer;
BEGIN
  INSERT INTO fee_invoice_series (fiscal_year, last_serial) VALUES (v_fy, 1)
  ON CONFLICT (fiscal_year) DO UPDATE SET last_serial = fee_invoice_series.last_serial + 1
  RETURNING last_serial INTO v_serial;
  RETURN 'ABF/' || v_fy || '/' || lpad(v_serial::text, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_fee_invoice_number(timestamptz) FROM public, anon, authenticated;

-- Issue fee invoices for every boutique whose delivered orders reached
-- their payout date (by _upto) without one. Returns how many were issued.
-- Runs daily before the Razorpay release; admins can run it too.
CREATE OR REPLACE FUNCTION public.generate_fee_invoices(_upto date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upto date := coalesce(_upto, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  b record;
  v_vendor record;
  v_gstin text;
  v_state text;
  v_intra boolean;
  v_taxable numeric;
  v_tax numeric;
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can issue fee invoices';
  END IF;

  FOR b IN
    SELECT vo.vendor_id, vo.payout_eligible_on AS payout_date,
           array_agg(vo.id ORDER BY vo.delivered_at) AS ids, count(*) AS n,
           min((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS first_day,
           max((vo.delivered_at AT TIME ZONE 'Asia/Kolkata')::date) AS last_day,
           sum(vo.product_value) AS product_value, sum(vo.commission_amount) AS commission,
           sum(vo.tech_fee_amount) AS tech_fee, max(vo.fee_gst_rate) AS gst_rate,
           bool_or(vo.commission_rate = 0) AS waived
    FROM vendor_orders vo
    WHERE vo.status = 'delivered' AND vo.fee_invoice_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_upto
    GROUP BY vo.vendor_id, vo.payout_eligible_on
  LOOP
    v_taxable := round(coalesce(b.commission, 0) + coalesce(b.tech_fee, 0), 2);
    IF v_taxable <= 0 THEN CONTINUE; END IF;

    SELECT v.name, v.address, v.pan_number, v.gst_number, k.legal_business_name, k.gstin, k.pan
    INTO v_vendor
    FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id WHERE v.id = b.vendor_id;
    v_gstin := coalesce(v_vendor.gstin, v_vendor.gst_number);
    v_state := coalesce(left(v_gstin, 2), gst_state_code(v_vendor.address->>'state'));
    v_intra := v_state = '24';
    v_tax := round(v_taxable * coalesce(b.gst_rate, 18) / 100, 2);

    INSERT INTO fee_invoices (
      invoice_number, vendor_id, payout_date, period_start, period_end,
      supplier_name, supplier_gstin, supplier_cin, supplier_state_code,
      recipient_name, recipient_legal_name, recipient_gstin, recipient_pan, recipient_address, recipient_state_code,
      supply_type, sac_code, order_count, product_value, commission_amount, tech_fee_amount, taxable_value,
      gst_rate, cgst_amount, sgst_amount, igst_amount, total, founding_waiver, vendor_order_ids
    ) VALUES (
      next_fee_invoice_number(now()), b.vendor_id, b.payout_date, b.first_day, b.last_day,
      'AllBoutiqs Private Limited', '24ABGCA7307J1ZP', 'U47912GJ2026PTC183684', '24',
      v_vendor.name, coalesce(v_vendor.legal_business_name, v_vendor.name), v_gstin,
      coalesce(v_vendor.pan, v_vendor.pan_number), v_vendor.address, v_state,
      CASE WHEN v_intra THEN 'intra_state' ELSE 'inter_state' END,
      (rates_on(now())).fee_sac_code, b.n, round(b.product_value, 2), round(b.commission, 2), round(b.tech_fee, 2), v_taxable,
      coalesce(b.gst_rate, 18),
      CASE WHEN v_intra THEN round(v_tax / 2, 2) ELSE 0 END,
      CASE WHEN v_intra THEN v_tax - round(v_tax / 2, 2) ELSE 0 END,
      CASE WHEN v_intra THEN 0 ELSE v_tax END,
      v_taxable + v_tax, coalesce(b.waived, false), b.ids
    )
    RETURNING id INTO v_id;

    UPDATE vendor_orders SET fee_invoice_id = v_id WHERE id = ANY (b.ids);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_fee_invoices(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_fee_invoices(date) TO authenticated;

-- Daily at 09:45 IST, before the 10:00 Razorpay release run.
SELECT cron.schedule('generate-fee-invoices', '15 4 * * *', $$SELECT public.generate_fee_invoices();$$);
