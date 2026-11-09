-- Paisa-exact money (client, 10 Nov 2026: "0.01 ka bhi mismatch nahi").
-- Every figure that has to agree with another now comes from one place,
-- with the same rounding:
--
-- * invoice_line_amounts(part): each line's amount, taxable value and GST
--   split as the tax invoice states them. The invoice generator
--   (_shared/invoice.ts), the boutique's fees and the credit notes all use
--   it - the invoice used to work them out in JavaScript.
-- * cum_share(): a share of a line for some of its pieces, by cumulative
--   rounding (pieces so far + these, less pieces so far), so any split adds
--   up to the line exactly. Credit notes, the boutique's goods/taxable value
--   after returns and the customer's return refund all take it - so a
--   return's refund = its credit note, and product_value = invoice - credit
--   notes.
-- * Fee invoice GST = the GST each order's payout was charged, added up.
-- * tcs_document_lines(): GST TCS by tax invoice / credit note date (the
--   GSTR-1 dates), each document taking the change in the part's rounded
--   TCS - over a part's documents they add up to the TCS deducted from its
--   payout exactly.
-- * order_cancellations.refund_amount: what a cancellation gave back
--   (before any refund charge); statement "refunded" is now that and the
--   completed returns' amounts, wherever the money went (bank, card,
--   wallet).
-- * money_checks(): every one of these equalities, with the difference
--   (always 0.00 when right) - shown in Download Statement.

CREATE OR REPLACE FUNCTION public.cum_share(_amount numeric, _pieces numeric, _of numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN coalesce(_of, 0) <= 0 OR coalesce(_pieces, 0) <= 0 THEN 0
              WHEN _pieces >= _of THEN coalesce(_amount, 0)
              ELSE round(coalesce(_amount, 0) * _pieces / _of, 2) END;
$$;

-- Each order line of a boutique part as its tax invoice states it: the
-- amount the customer paid for it (price x quantity less its coupon
-- share), the GST rate for that, taxable value, GST and its split
-- (CGST + SGST when the boutique's GSTIN state is the delivery state, else
-- IGST). The rate is 0 (hsn_missing) when the category has no HSN code.
CREATE OR REPLACE FUNCTION public.invoice_line_amounts(_vendor_order_id uuid)
RETURNS TABLE (order_item_id uuid, line_total numeric, discount numeric, gst_rate numeric, hsn_missing boolean,
               taxable numeric, cgst numeric, sgst numeric, igst numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  v_gstin text;
  v_intra boolean;
  it record;
  v_disc numeric;
  v_total numeric;
  v_rate numeric;
  v_taxable numeric;
  v_tax numeric;
BEGIN
  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  SELECT coalesce(k.gstin, v.gst_number) INTO v_gstin
  FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id WHERE v.id = vo.vendor_id;
  v_intra := v_gstin IS NOT NULL AND left(v_gstin, 2) = gst_state_code(o.shipping_address->>'state');

  FOR it IN
    SELECT oi.id, oi.price, oi.quantity, oi.discount_amount, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
    ORDER BY oi.created_at, oi.id
  LOOP
    -- The coupon share checkout recorded for this line; orders from before
    -- that share the order's discount by value.
    v_disc := coalesce(it.discount_amount,
      CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * it.price * it.quantity / o.subtotal, 2) ELSE 0 END);
    v_total := round(it.price * it.quantity - v_disc, 2);
    v_rate := gst_rate_for(it.hsn_code_id, v_total / greatest(it.quantity, 1));
    order_item_id := it.id;
    line_total := v_total;
    discount := v_disc;
    hsn_missing := v_rate IS NULL;
    gst_rate := coalesce(v_rate, 0);
    v_taxable := round(v_total / (1 + coalesce(v_rate, 0) / 100), 2);
    v_tax := v_total - v_taxable;
    taxable := v_taxable;
    cgst := CASE WHEN v_intra THEN round(v_tax / 2, 2) ELSE 0 END;
    sgst := CASE WHEN v_intra THEN v_tax - round(v_tax / 2, 2) ELSE 0 END;
    igst := CASE WHEN v_intra THEN 0 ELSE v_tax END;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_line_amounts(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_line_amounts(uuid) TO service_role;

-- As 20261110160000_courier_charge_on_returns_and_rto, with the lines from
-- invoice_line_amounts and returned pieces taken off by cum_share.
CREATE OR REPLACE FUNCTION public.compute_vendor_order_fees(_vendor_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  vo public.vendor_orders;
  o public.orders;
  r public.platform_rates;
  it record;
  v_gstin text;
  v_pan text;
  v_constitution text;
  v_supply text;
  v_gross numeric;
  v_disc numeric;
  v_net numeric;
  v_rate numeric;
  v_taxable numeric;
  v_goods numeric := 0;
  v_product numeric := 0;
  v_gst numeric := 0;
  v_pieces integer := 0;
  v_kept integer;
  v_gone boolean;
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
  v_logistics numeric;
  v_fee_gst numeric;
  v_gateway_rate numeric := 0;
  v_gateway numeric := 0;
  v_ship_to_boutique boolean;
  v_shipping_credit numeric;
  v_courier numeric;
  v_tcs numeric;
  v_tds_rate numeric;
  v_fy_sales numeric;
  v_fy_start date;
  v_tds numeric;
BEGIN
  SELECT * INTO vo FROM vendor_orders WHERE id = _vendor_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- Money already sent (or batched for sending) stays as it was.
  IF vo.rzp_transfer_id IS NOT NULL OR vo.payout_id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO o FROM orders WHERE id = vo.order_id;
  r := rates_on(coalesce(o.created_at, now()));
  IF r.id IS NULL THEN RETURN; END IF;

  SELECT coalesce(k.gstin, v.gst_number), coalesce(k.pan, v.pan_number), k.business_constitution
  INTO v_gstin, v_pan, v_constitution
  FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id
  WHERE v.id = vo.vendor_id;
  v_supply := CASE WHEN v_gstin IS NOT NULL AND left(v_gstin, 2) = gst_state_code(o.shipping_address->>'state')
                   THEN 'intra_state' ELSE 'inter_state' END;

  -- A part cancelled or back undelivered sells nothing; a returned piece
  -- (refund done) is no longer sold either.
  v_gone := vo.status IN ('cancelled', 'returned');
  -- Each line's amounts as its tax invoice states them (invoice_line_amounts),
  -- less the returned pieces' share exactly as their credit notes take it
  -- (cumulative rounding) - so product_value / goods_value always equal the
  -- invoice less its credit notes, to the paisa.
  FOR it IN
    SELECT a.*, oi.quantity
    FROM public.invoice_line_amounts(vo.id) a
    JOIN order_items oi ON oi.id = a.order_item_id
  LOOP
    v_kept := CASE WHEN v_gone THEN 0 ELSE greatest(it.quantity - public.returned_quantity(it.order_item_id), 0) END;
    v_net := it.line_total - public.cum_share(it.line_total, it.quantity - v_kept, it.quantity);
    v_taxable := it.taxable - public.cum_share(it.taxable, it.quantity - v_kept, it.quantity);
    IF it.hsn_missing THEN
      v_hsn_missing := true;
    END IF;
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
    -- Courier & logistics: every piece that left the boutique - returned
    -- or back undelivered too (client, 10 Nov 2026); none when the part was
    -- cancelled before it went out.
    v_pieces := v_pieces + CASE WHEN v_gone AND NOT vo.logistics_kept THEN 0 ELSE coalesce(it.quantity, 0) END;
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  -- Courier & logistics: a fixed charge per piece (client, 10 Nov 2026).
  v_logistics := round(v_pieces * coalesce(r.logistics_fee_per_piece, 0), 2);
  v_fee_gst := round((v_commission + v_tech + v_logistics) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  -- Only the part paid online carries the gateway fee - not what the
  -- customer paid from their wallet (no gateway took that).
  IF o.payment_method = 'razorpay' THEN
    v_gateway_rate := r.payment_gateway_fee_pct;
    v_gateway := round((v_goods + coalesce(vo.shipping_cost, 0)) * v_gateway_rate / 100
                       * CASE WHEN coalesce(o.total, 0) > 0
                              THEN greatest(o.total - coalesce(o.wallet_amount, 0), 0) / o.total
                              ELSE 1 END, 2);
  END IF;

  v_tcs := round(v_product * r.gst_tcs_pct / 100, 2);

  -- Income-tax TDS (194-O): no PAN -> higher rate; individuals
  -- (proprietorships) and HUFs with PAN are free until their sales this
  -- financial year pass the limit; firms and companies from the first order.
  IF v_pan IS NULL THEN
    v_tds_rate := r.tds_no_pan_pct;
  ELSIF coalesce(v_constitution, 'proprietorship') IN ('proprietorship', 'huf') THEN
    v_fy_start := make_date(
      CASE WHEN extract(month FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata')) >= 4
           THEN extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int
           ELSE extract(year FROM (coalesce(o.created_at, now()) AT TIME ZONE 'Asia/Kolkata'))::int - 1 END, 4, 1);
    SELECT coalesce(sum(x.product_value), 0) INTO v_fy_sales
    FROM vendor_orders x JOIN orders xo ON xo.id = x.order_id
    WHERE x.vendor_id = vo.vendor_id AND x.id <> vo.id AND x.status <> 'cancelled'
      AND (xo.created_at AT TIME ZONE 'Asia/Kolkata')::date >= v_fy_start
      AND xo.created_at <= coalesce(o.created_at, now());
    v_tds_rate := CASE WHEN v_fy_sales + v_product > r.tds_individual_exempt_upto THEN r.tds_pct ELSE 0 END;
  ELSE
    v_tds_rate := r.tds_pct;
  END IF;
  v_tds := round(v_product * v_tds_rate / 100, 2);

  PERFORM set_config('app.vendor_order_fee_calc', 'on', true);
  UPDATE vendor_orders SET
    rates_effective_from = r.effective_from,
    goods_value = v_goods,
    product_value = v_product,
    goods_gst = v_gst,
    supply_type = v_supply,
    commission_rate = v_commission_pct,
    commission_amount = v_commission,
    tech_fee_rate = r.technology_fee_pct,
    tech_fee_amount = v_tech,
    logistics_fee_rate = coalesce(r.logistics_fee_per_piece, 0),
    logistics_fee_amount = v_logistics,
    fee_gst_rate = r.fee_gst_pct,
    fee_gst_amount = v_fee_gst,
    gateway_fee_rate = v_gateway_rate,
    gateway_fee_amount = v_gateway,
    shipping_to_boutique = v_ship_to_boutique,
    tcs_rate = r.gst_tcs_pct,
    tcs_amount = v_tcs,
    tds_rate = v_tds_rate,
    tds_amount = v_tds,
    hsn_missing = v_hsn_missing,
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_logistics - v_fee_gst - v_gateway
                        - v_courier
                        -- The customer paid the COD charge at checkout (Extra
                        -- list M): the boutique doesn't pay it as well.
                        - CASE WHEN coalesce(o.cod_charge, 0) > 0 THEN 0 ELSE coalesce(vo.cod_handling_charge, 0) END
                        - v_tcs - v_tds, 2),
    fees_computed_at = now()
  WHERE id = vo.id;
  PERFORM set_config('app.vendor_order_fee_calc', 'off', true);
END;
$function$;


-- As 20261110170000_credit_notes, with cumulative rounding.
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
    -- Cumulative rounding: the pieces credited so far plus these, less
    -- those so far - every split adds up to the line exactly, and the
    -- boutique's fees (compute_vendor_order_fees) and the customer's refund
    -- (prepare_return_request) take the same amounts.
    v_total := public.cum_share(l.total, l.q_done + v_qty, l.quantity) - public.cum_share(l.total, l.q_done, l.quantity);
    v_taxable := public.cum_share(l.taxable_value, l.q_done + v_qty, l.quantity) - public.cum_share(l.taxable_value, l.q_done, l.quantity);
    v_cgst := public.cum_share(l.cgst_amount, l.q_done + v_qty, l.quantity) - public.cum_share(l.cgst_amount, l.q_done, l.quantity);
    v_sgst := CASE WHEN l.sgst_amount = 0 THEN 0 ELSE v_total - v_taxable - v_cgst END;
    v_igst := CASE WHEN l.sgst_amount = 0 THEN v_total - v_taxable - v_cgst ELSE 0 END;
    v_full := v_qty = l.quantity - l.q_done;
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


-- As 20261102100000_customer_wallet, with each item's refund amount taken
-- exactly as its credit note will be.
CREATE OR REPLACE FUNCTION public.prepare_return_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer boolean := coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin');
  v_method text;
BEGIN
  SELECT payment_method INTO v_method FROM public.orders
  WHERE id = NEW.order_id AND (NOT v_customer OR user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_customer THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) e
      WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi
                        WHERE oi.id::text = e->>'order_item_id' AND oi.order_id = NEW.order_id)) THEN
      RAISE EXCEPTION 'An item in this request isn''t on the order';
    END IF;
    NEW.refund_amount := 0;
    NEW.refund_fee := 0;
    NEW.refund_fee_gst := 0;
  END IF;

  -- Every request (a customer's or an admin's):
    -- Each item's refund ("amount") is exactly what its credit note will
    -- take: the line's amount for these pieces by cumulative rounding after
    -- the pieces of earlier open returns (issue_credit_note does the same).
    NEW.items := (
      SELECT coalesce(jsonb_agg(
        t.e || jsonb_build_object(
          'quantity', x.q,
          'amount', x.amount,
          'price', round(x.amount / x.q, 2))
        ORDER BY t.ord), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
      JOIN public.order_items oi ON oi.id::text = t.e->>'order_item_id'
      CROSS JOIN LATERAL (
        SELECT least(greatest(coalesce((t.e->>'quantity')::integer, oi.quantity), 1), oi.quantity) AS q,
               coalesce((SELECT sum(coalesce((e2->>'quantity')::integer, oi.quantity))
                         FROM public.return_requests r2
                         CROSS JOIN LATERAL jsonb_array_elements(coalesce(r2.items, '[]'::jsonb)) e2
                         WHERE r2.order_id = NEW.order_id AND r2.request_type = 'return'
                           AND r2.status NOT IN ('rejected', 'cancelled')
                           AND e2->>'order_item_id' = oi.id::text), 0)::integer AS before_q,
               (SELECT a.line_total FROM public.invoice_line_amounts(oi.vendor_order_id) a WHERE a.order_item_id = oi.id) AS line_total
      ) b
      CROSS JOIN LATERAL (
        SELECT b.q,
               public.cum_share(b.line_total, least(b.before_q + b.q, oi.quantity), oi.quantity)
                 - public.cum_share(b.line_total, least(b.before_q, oi.quantity), oi.quantity) AS amount
      ) x
    );

  IF NEW.request_type IS DISTINCT FROM 'return' THEN
    NEW.refund_method := NULL;
  ELSIF v_method = 'wallet' THEN
    -- Paid from the wallet: it goes back to the wallet.
    NEW.refund_method := 'wallet';
  ELSIF NEW.refund_method IS NULL THEN
    IF v_customer THEN
      RAISE EXCEPTION 'Choose how you''d like your refund' USING ERRCODE = 'check_violation';
    END IF;
    NEW.refund_method := CASE WHEN v_method = 'cod' THEN 'bank' ELSE 'original' END;
  ELSIF (v_method = 'cod' AND NEW.refund_method = 'original')
     OR (v_method <> 'cod' AND NEW.refund_method = 'bank') THEN
    RAISE EXCEPTION 'That refund option isn''t available for this order' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


-- What a cancellation gave back, before any refund charge.
ALTER TABLE public.order_cancellations ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2);
UPDATE public.order_cancellations oc
SET refund_amount = round(vo.subtotal + coalesce(vo.shipping_cost, 0)
                          - coalesce((SELECT sum(coalesce(oi.discount_amount, 0)) FROM order_items oi WHERE oi.vendor_order_id = vo.id), 0), 2)
FROM public.vendor_orders vo JOIN public.orders o ON o.id = vo.order_id
WHERE oc.vendor_order_id = vo.id AND oc.refund_amount IS NULL
  AND o.payment_method IN ('razorpay', 'wallet') AND (oc.refund_id IS NOT NULL OR o.payment_method = 'wallet');

-- As 20261110160000_courier_charge_on_returns_and_rto, with the GST as the
-- parts' own GST added up.
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
           sum(vo.tech_fee_amount) AS tech_fee, sum(vo.logistics_fee_amount) AS logistics,
           max(vo.fee_gst_rate) AS gst_rate, sum(vo.fee_gst_amount) AS fee_gst,
           bool_or(vo.commission_rate = 0) AS waived
    FROM vendor_orders vo
    WHERE (vo.status = 'delivered' OR (vo.status IN ('cancelled', 'returned') AND vo.logistics_kept))
      AND vo.fee_invoice_id IS NULL
      AND vo.payout_eligible_on IS NOT NULL AND vo.payout_eligible_on <= v_upto
      -- Settled first: no open return, cash in - its fees are final.
      AND (vo.payout_id IS NOT NULL OR public.vendor_order_payout_blocker(vo.id) IS NULL)
    GROUP BY vo.vendor_id, vo.payout_eligible_on
  LOOP
    v_taxable := round(coalesce(b.commission, 0) + coalesce(b.tech_fee, 0) + coalesce(b.logistics, 0), 2);
    IF v_taxable <= 0 THEN CONTINUE; END IF;

    SELECT v.name, v.address, v.pan_number, v.gst_number, k.legal_business_name, k.gstin, k.pan
    INTO v_vendor
    FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id = v.id WHERE v.id = b.vendor_id;
    v_gstin := coalesce(v_vendor.gstin, v_vendor.gst_number);
    v_state := coalesce(left(v_gstin, 2), gst_state_code(v_vendor.address->>'state'));
    v_intra := v_state = '24';
    -- The GST each order's payout was charged, added up - so the invoice
    -- (the boutique's input tax credit) equals what was deducted, to the paisa.
    v_tax := round(coalesce(b.fee_gst, 0), 2);

    INSERT INTO fee_invoices (
      invoice_number, vendor_id, payout_date, period_start, period_end,
      supplier_name, supplier_gstin, supplier_cin, supplier_state_code,
      recipient_name, recipient_legal_name, recipient_gstin, recipient_pan, recipient_address, recipient_state_code,
      supply_type, sac_code, order_count, product_value, commission_amount, tech_fee_amount,
      logistics_fee_amount, logistics_sac_code, taxable_value,
      gst_rate, cgst_amount, sgst_amount, igst_amount, total, founding_waiver, vendor_order_ids
    ) VALUES (
      next_fee_invoice_number(now()), b.vendor_id, b.payout_date, b.first_day, b.last_day,
      'AllBoutiqs Private Limited', '24ABGCA7307J1ZP', 'U47912GJ2026PTC183684', '24',
      v_vendor.name, coalesce(v_vendor.legal_business_name, v_vendor.name), v_gstin,
      coalesce(v_vendor.pan, v_vendor.pan_number), v_vendor.address, v_state,
      CASE WHEN v_intra THEN 'intra_state' ELSE 'inter_state' END,
      (rates_on(now())).fee_sac_code, b.n, round(b.product_value, 2), round(b.commission, 2), round(b.tech_fee, 2),
      round(coalesce(b.logistics, 0), 2), (rates_on(now())).logistics_sac_code, v_taxable,
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


-- As 20261110160000_courier_charge_on_returns_and_rto (same columns), with
-- "refunded" = what went back to the customer before any refund charge
-- (cancellations and completed returns, wherever it went), and the returned
-- taxable value as the credit notes take it.
CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
 RETURNS TABLE(vendor_id uuid, boutique_code text, boutique_name text, vendor_order_id uuid, order_number text, order_date date, delivered_on date, status text, payment_method text, supply_type text, goods_value numeric, product_value numeric, gst numeric, commission numeric, tech_fee numeric, fee_gst numeric, gateway_fee numeric, courier numeric, cod_charge numeric, refunded numeric, net_taxable numeric, tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric, tds_rate numeric, tds numeric, net_payout numeric, payout_status text, payment_date date, utr text, fee_invoice_number text, discount numeric, shipping_credit numeric, returned_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only download your own statement';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT vo.*, o.created_at AS order_created, o.payment_method AS pay_method, o.cod_charge AS customer_cod,
           v.boutique_code AS bcode, v.name AS bname,
           vp.paid_at AS manual_paid_at, vp.payment_reference AS manual_utr,
           fi.invoice_number AS fee_inv,
           -- This boutique's share of the coupon: what checkout recorded on
           -- its lines, or (older orders) the order's discount by value.
           coalesce(
             (SELECT CASE WHEN bool_or(oi.discount_amount IS NOT NULL) THEN sum(coalesce(oi.discount_amount, 0)) END
              FROM order_items oi WHERE oi.vendor_order_id = vo.id),
             CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * vo.subtotal / o.subtotal, 2) ELSE 0 END
           ) AS disc_share,
           -- Taxable value of the pieces returned (refund done), as their
           -- credit notes take it - already out of product_value.
           (SELECT coalesce(sum(public.cum_share(a.taxable, least(public.returned_quantity(a.order_item_id), oi.quantity), oi.quantity)), 0)
              FROM public.invoice_line_amounts(vo.id) a
              JOIN order_items oi ON oi.id = a.order_item_id) AS returned_taxable
    FROM vendor_orders vo
    JOIN orders o ON o.id = vo.order_id
    JOIN vendors v ON v.id = vo.vendor_id
    LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id
    LEFT JOIN fee_invoices fi ON fi.id = vo.fee_invoice_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
      AND public.order_is_placed(o.payment_method, o.payment_status)
  ),
  -- What the customer is given back for each boutique order, before any
  -- refund charge (wherever it went - bank, card or wallet): a cancelled
  -- paid part in full (order_cancellations.refund_amount), and each
  -- completed return's items at their own amounts.
  cancel_refunds AS (
    SELECT oc.vendor_order_id AS vo_id, sum(coalesce(oc.refund_amount, 0)) AS amt
    FROM order_cancellations oc
    WHERE oc.vendor_order_id IN (SELECT id FROM base)
    GROUP BY oc.vendor_order_id
  ),
  return_refunds AS (
    SELECT oi.vendor_order_id AS vo_id,
           sum(coalesce((elem->>'amount')::numeric, (elem->>'price')::numeric * coalesce((elem->>'quantity')::int, oi.quantity))) AS amt
    FROM return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) AS elem
    JOIN order_items oi ON oi.id = (elem->>'order_item_id')::uuid
    WHERE rr.request_type = 'return' AND rr.status = 'completed' AND oi.vendor_order_id IN (SELECT id FROM base)
    GROUP BY oi.vendor_order_id
  ),
  calc AS (
    SELECT b.*,
           round(coalesce(cr.amt, 0) + coalesce(rf.amt, 0), 2) AS refunded_amt,
           (b.status IN ('cancelled', 'returned')) AS is_cancelled
    FROM base b
    LEFT JOIN cancel_refunds cr ON cr.vo_id = b.id
    LEFT JOIN return_refunds rf ON rf.vo_id = b.id
  ),
  taxed AS (
    -- product_value is already after returned pieces (and 0 when cancelled).
    SELECT c.*, CASE WHEN c.is_cancelled THEN 0 ELSE c.product_value END AS net_tax
    FROM calc c
  )
  SELECT t.vendor_id, t.bcode, t.bname, t.id,
         '#' || upper(left(t.order_id::text, 8)),
         (t.order_created AT TIME ZONE 'Asia/Kolkata')::date,
         (t.delivered_at AT TIME ZONE 'Asia/Kolkata')::date,
         t.status, t.pay_method, t.supply_type,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.goods_value END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.product_value END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.goods_gst END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.commission_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tech_fee_amount END,
         CASE WHEN t.is_cancelled AND NOT t.logistics_kept THEN 0 ELSE t.fee_gst_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.gateway_fee_amount END,
         t.courier_charge + CASE WHEN t.is_cancelled AND NOT t.logistics_kept THEN 0 ELSE t.logistics_fee_amount END,
         CASE WHEN coalesce(t.customer_cod, 0) > 0 THEN 0 ELSE t.cod_handling_charge END,
         t.refunded_amt, t.net_tax,
         t.tcs_rate,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 100, 2) - round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN 0 ELSE round(t.net_tax * t.tcs_rate / 100, 2) END,
         t.tds_rate,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tds_amount END,
         CASE WHEN t.is_cancelled AND NOT t.logistics_kept THEN 0 ELSE t.net_payable END,
         CASE WHEN coalesce(t.rzp_settled_at, t.manual_paid_at) IS NOT NULL THEN 'paid'
              WHEN t.rzp_transfer_status = 'released' THEN 'sent'
              ELSE 'pending' END,
         (coalesce(t.rzp_settled_at, t.manual_paid_at) AT TIME ZONE 'Asia/Kolkata')::date,
         coalesce(t.rzp_settlement_utr, t.manual_utr),
         t.fee_inv,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.disc_share END,
         CASE WHEN t.is_cancelled OR NOT t.shipping_to_boutique THEN 0 ELSE coalesce(t.shipping_cost, 0) END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.returned_taxable END
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$function$;


-- GST TCS by document (tax invoice / credit note) date - the GSTR-1 dates.
-- Each document takes the change in its part's TCS on the running net
-- taxable value (invoice less credit notes so far), rounded the way the
-- payout's TCS is, so a part's documents always add up to the TCS deducted
-- from its payout.
CREATE OR REPLACE FUNCTION public.tcs_document_lines(_vendor_id uuid, _from date, _to date)
RETURNS TABLE (vendor_id uuid, boutique_code text, boutique_name text, gstin text, vendor_order_id uuid,
               doc_type text, doc_number text, doc_date date, supply_type text, taxable numeric,
               tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only see your own TCS';
  END IF;

  RETURN QUERY
  WITH docs AS (
    SELECT i.vendor_order_id AS vo_id, 'invoice'::text AS kind, i.invoice_number AS no, i.issued_at AS at,
           (SELECT coalesce(sum(il.taxable_value), 0) FROM invoice_lines il
            WHERE il.invoice_id = i.id AND il.order_item_id IS NOT NULL) AS amt
    FROM invoices i WHERE (_vendor_id IS NULL OR i.vendor_id = _vendor_id)
    UNION ALL
    SELECT c.vendor_order_id, 'credit_note', c.credit_note_number, c.issued_at,
           -(SELECT coalesce(sum(cl.taxable_value), 0) FROM credit_note_lines cl
             WHERE cl.credit_note_id = c.id AND cl.order_item_id IS NOT NULL)
    FROM credit_notes c WHERE (_vendor_id IS NULL OR c.vendor_id = _vendor_id)
  ),
  run AS (
    SELECT d.*, sum(d.amt) OVER (PARTITION BY d.vo_id ORDER BY d.at, d.kind DESC, d.no ROWS UNBOUNDED PRECEDING) AS after_net
    FROM docs d
  ),
  x AS (
    SELECT r.*, r.after_net - r.amt AS before_net, vo.tcs_rate AS rate, vo.supply_type AS st, vo.vendor_id AS vid,
           v.boutique_code AS bcode, v.name AS bname, coalesce(k.gstin, v.gst_number) AS g
    FROM run r
    JOIN vendor_orders vo ON vo.id = r.vo_id
    JOIN vendors v ON v.id = vo.vendor_id
    LEFT JOIN vendor_kyc k ON k.vendor_id = v.id
  )
  SELECT x.vid, x.bcode, x.bname, x.g, x.vo_id, x.kind, x.no, (x.at AT TIME ZONE 'Asia/Kolkata')::date, x.st, x.amt, x.rate,
         CASE WHEN x.st = 'intra_state' THEN round(x.after_net * x.rate / 200, 2) - round(x.before_net * x.rate / 200, 2) ELSE 0 END,
         CASE WHEN x.st = 'intra_state'
              THEN (round(x.after_net * x.rate / 100, 2) - round(x.after_net * x.rate / 200, 2))
                 - (round(x.before_net * x.rate / 100, 2) - round(x.before_net * x.rate / 200, 2))
              ELSE 0 END,
         CASE WHEN x.st = 'intra_state' THEN 0 ELSE round(x.after_net * x.rate / 100, 2) - round(x.before_net * x.rate / 100, 2) END
  FROM x
  WHERE (x.at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
  ORDER BY x.at, x.no;
END;
$function$;
REVOKE ALL ON FUNCTION public.tcs_document_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tcs_document_lines(uuid, date, date) TO authenticated, service_role;

-- Every money equality, per boutique part / document / payout touched in
-- the period, with its difference (0.00 when right).
CREATE OR REPLACE FUNCTION public.money_checks(_vendor_id uuid, _from date, _to date)
RETURNS TABLE (check_name text, boutique_name text, reference text, expected numeric, actual numeric, difference numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (_vendor_id IS NOT NULL AND public.is_vendor_member(auth.uid(), _vendor_id))
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'You can only check your own figures';
  END IF;

  RETURN QUERY
  WITH parts AS (
    SELECT vo.*, v.name AS bname, '#' || upper(left(vo.order_id::text, 8)) AS ref, o.payment_method AS pay, o.cod_charge AS customer_cod
    FROM vendor_orders vo JOIN orders o ON o.id = vo.order_id JOIN vendors v ON v.id = vo.vendor_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
      AND public.order_is_placed(o.payment_method, o.payment_status)
  ),
  inv AS (
    SELECT i.vendor_order_id AS vo_id,
           sum(il.taxable_value) FILTER (WHERE il.order_item_id IS NOT NULL) AS taxable,
           sum(il.total) FILTER (WHERE il.order_item_id IS NOT NULL) AS total
    FROM invoices i JOIN invoice_lines il ON il.invoice_id = i.id
    WHERE i.vendor_order_id IN (SELECT id FROM parts)
    GROUP BY i.vendor_order_id
  ),
  cn AS (
    SELECT c.vendor_order_id AS vo_id,
           coalesce(sum(cl.taxable_value) FILTER (WHERE cl.order_item_id IS NOT NULL), 0) AS taxable,
           coalesce(sum(cl.total) FILTER (WHERE cl.order_item_id IS NOT NULL), 0) AS total
    FROM credit_notes c JOIN credit_note_lines cl ON cl.credit_note_id = c.id
    WHERE c.vendor_order_id IN (SELECT id FROM parts)
    GROUP BY c.vendor_order_id
  ),
  tcs AS (
    SELECT t.vendor_order_id AS vo_id, sum(t.tcs_cgst + t.tcs_sgst + t.tcs_igst) AS amt
    FROM public.tcs_document_lines(_vendor_id, '2000-01-01', '2999-12-31') t
    WHERE t.vendor_order_id IN (SELECT id FROM parts)
    GROUP BY t.vendor_order_id
  ),
  checks(check_name, boutique_name, reference, expected, actual) AS (
  -- 1. Each part: goods - every deduction = payout.
  SELECT 'Payout = goods - fees - taxes'::text, p.bname, p.ref,
         round(p.goods_value + CASE WHEN p.shipping_to_boutique THEN coalesce(p.shipping_cost, 0) ELSE 0 END
               - p.commission_amount - p.tech_fee_amount - p.logistics_fee_amount - p.fee_gst_amount - p.gateway_fee_amount
               - CASE WHEN p.shipping_to_boutique THEN p.courier_charge ELSE 0 END
               - CASE WHEN coalesce(p.customer_cod, 0) > 0 THEN 0 ELSE p.cod_handling_charge END
               - p.tcs_amount - p.tds_amount, 2),
         p.net_payable
  FROM parts p
  UNION ALL
  -- 2. Fee GST on each part = 18% of its fees.
  SELECT 'Fee GST = rate x fees', p.bname, p.ref,
         round((p.commission_amount + p.tech_fee_amount + p.logistics_fee_amount) * p.fee_gst_rate / 100, 2), p.fee_gst_amount
  FROM parts p
  UNION ALL
  -- 3/4. Invoiced parts: sale after returns = tax invoice - credit notes.
  SELECT 'Taxable value = invoice - credit notes', p.bname, p.ref, i.taxable - coalesce(c.taxable, 0), p.product_value
  FROM parts p JOIN inv i ON i.vo_id = p.id LEFT JOIN cn c ON c.vo_id = p.id
  UNION ALL
  SELECT 'Goods value = invoice - credit notes', p.bname, p.ref, i.total - coalesce(c.total, 0), p.goods_value
  FROM parts p JOIN inv i ON i.vo_id = p.id LEFT JOIN cn c ON c.vo_id = p.id
  UNION ALL
  -- 5. TCS filed on the documents = TCS deducted from the payout.
  SELECT 'TCS on documents = TCS deducted', p.bname, p.ref, t.amt, p.tcs_amount
  FROM parts p JOIN tcs t ON t.vo_id = p.id
  UNION ALL
  -- 6. TCS deducted = rate x taxable value.
  SELECT 'TCS = rate x taxable value', p.bname, p.ref, round(p.product_value * p.tcs_rate / 100, 2), p.tcs_amount
  FROM parts p
  UNION ALL
  -- 7. Fee invoices: taxable and GST = their orders'.
  SELECT 'Fee invoice taxable = its orders'' fees', v.name, f.invoice_number,
         (SELECT coalesce(sum(vo.commission_amount + vo.tech_fee_amount + vo.logistics_fee_amount), 0)
          FROM vendor_orders vo WHERE vo.fee_invoice_id = f.id), f.taxable_value
  FROM fee_invoices f JOIN vendors v ON v.id = f.vendor_id
  WHERE (_vendor_id IS NULL OR f.vendor_id = _vendor_id) AND (f.issued_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
  UNION ALL
  SELECT 'Fee invoice GST = GST deducted', v.name, f.invoice_number,
         (SELECT coalesce(sum(vo.fee_gst_amount), 0) FROM vendor_orders vo WHERE vo.fee_invoice_id = f.id),
         f.cgst_amount + f.sgst_amount + f.igst_amount
  FROM fee_invoices f JOIN vendors v ON v.id = f.vendor_id
  WHERE (_vendor_id IS NULL OR f.vendor_id = _vendor_id) AND (f.issued_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
  UNION ALL
  -- 8. Payouts: the transfer = its orders' payouts.
  SELECT 'Payout transfer = its orders', v.name, coalesce(vp.payment_reference, vp.payout_date::text),
         (SELECT coalesce(sum(vo.net_payable - coalesce(vo.rzp_reversed_amount, 0)), 0) FROM vendor_orders vo WHERE vo.payout_id = vp.id),
         vp.net_payable
  FROM vendor_payouts vp JOIN vendors v ON v.id = vp.vendor_id
  WHERE (_vendor_id IS NULL OR vp.vendor_id = _vendor_id) AND vp.payout_date BETWEEN _from AND _to
  UNION ALL
  -- 9. Completed returns: refund = its credit notes.
  SELECT 'Return refund = its credit notes', max(v.name), max('#' || upper(left(rr.order_id::text, 8))),
         (SELECT coalesce(sum(c.total), 0) FROM credit_notes c WHERE c.return_request_id = rr.id),
         sum(coalesce((e->>'amount')::numeric, (e->>'price')::numeric * coalesce((e->>'quantity')::int, 1)))
  FROM return_requests rr
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) e
  JOIN order_items oi ON oi.id::text = e->>'order_item_id'
  JOIN vendor_orders rvo ON rvo.id = oi.vendor_order_id
  JOIN vendors v ON v.id = rvo.vendor_id
  WHERE rr.request_type = 'return' AND rr.status = 'completed'
    AND (_vendor_id IS NULL OR rvo.vendor_id = _vendor_id)
    AND (rr.updated_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.vendor_order_id = oi.vendor_order_id)
  GROUP BY rr.id
  )
  SELECT c.check_name, c.boutique_name, c.reference, c.expected, c.actual, round(c.actual - c.expected, 2)
  FROM checks c;
END;
$function$;
REVOKE ALL ON FUNCTION public.money_checks(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.money_checks(uuid, date, date) TO authenticated, service_role;

-- Bring unpaid parts up to date with the invoice amounts.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.vendor_orders WHERE payout_id IS NULL AND rzp_transfer_id IS NULL LOOP
    PERFORM public.compute_vendor_order_fees(r.id);
  END LOOP;
END;
$$;
