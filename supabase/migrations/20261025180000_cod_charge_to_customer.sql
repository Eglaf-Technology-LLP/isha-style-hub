-- Extra list from the client (M): a Cash on Delivery order now charges the
-- customer Shiprocket's real COD charge for the parcel (worked out at
-- checkout by shiprocket-cod-charge: warehouse -> customer PIN, weight,
-- order value, the courier the warehouse books by default). It is part of
-- the order total and of what the courier collects. Since the customer
-- pays it, the boutique is no longer charged the COD handling charge on
-- such an order (orders from before keep it).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_charge numeric(12,2) NOT NULL DEFAULT 0
  CHECK (cod_charge >= 0);

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
  v_hsn_missing boolean := false;
  v_commission_pct numeric;
  v_commission numeric;
  v_tech numeric;
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

  FOR it IN
    SELECT oi.price, oi.quantity, oi.discount_amount, c.hsn_code_id
    FROM order_items oi
    LEFT JOIN products p ON p.id::text = oi.product_id::text
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.vendor_order_id = vo.id
  LOOP
    v_gross := it.price * it.quantity;
    -- The coupon share checkout recorded for this line (only the lines the
    -- coupon covered have one); orders from before that share it by value.
    v_disc := coalesce(it.discount_amount,
      CASE WHEN coalesce(o.subtotal, 0) > 0 THEN round(coalesce(o.discount_amount, 0) * v_gross / o.subtotal, 2) ELSE 0 END);
    v_net := v_gross - v_disc;
    v_rate := gst_rate_for(it.hsn_code_id, v_net / greatest(it.quantity, 1));
    IF v_rate IS NULL THEN
      v_hsn_missing := true;
      v_rate := 0;
    END IF;
    v_taxable := round(v_net / (1 + v_rate / 100), 2);
    v_goods := v_goods + v_net;
    v_product := v_product + v_taxable;
    v_gst := v_gst + (v_net - v_taxable);
  END LOOP;

  v_commission_pct := effective_commission_pct(vo.vendor_id, coalesce(o.created_at, now()));
  v_commission := round(v_product * v_commission_pct / 100, 2);
  v_tech := round(v_product * r.technology_fee_pct / 100, 2);
  v_fee_gst := round((v_commission + v_tech) * r.fee_gst_pct / 100, 2);

  -- Courier: when AllBoutiqs bears it, the customer's shipping charge is
  -- AllBoutiqs' too; when charged to the boutique, the boutique gets the
  -- shipping charge and pays the courier cost (filled in once booked).
  v_ship_to_boutique := r.charge_courier_to_boutique;
  v_shipping_credit := CASE WHEN v_ship_to_boutique THEN coalesce(vo.shipping_cost, 0) ELSE 0 END;
  v_courier := CASE WHEN v_ship_to_boutique THEN coalesce(vo.courier_charge, 0) ELSE 0 END;

  IF o.payment_method = 'razorpay' THEN
    v_gateway_rate := r.payment_gateway_fee_pct;
    v_gateway := round((v_goods + coalesce(vo.shipping_cost, 0)) * v_gateway_rate / 100, 2);
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
    net_payable = round(v_goods + v_shipping_credit - v_commission - v_tech - v_fee_gst - v_gateway
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

-- The statement (and the Reports tab) shows the boutique no COD charge on
-- an order whose customer paid it, matching its payout.
CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
 RETURNS TABLE(vendor_id uuid, boutique_code text, boutique_name text, vendor_order_id uuid, order_number text, order_date date, delivered_on date, status text, payment_method text, supply_type text, goods_value numeric, product_value numeric, gst numeric, commission numeric, tech_fee numeric, fee_gst numeric, gateway_fee numeric, courier numeric, cod_charge numeric, refunded numeric, net_taxable numeric, tcs_rate numeric, tcs_cgst numeric, tcs_sgst numeric, tcs_igst numeric, tds_rate numeric, tds numeric, net_payout numeric, payout_status text, payment_date date, utr text, fee_invoice_number text, discount numeric, shipping_credit numeric)
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
           ) AS disc_share
    FROM vendor_orders vo
    JOIN orders o ON o.id = vo.order_id
    JOIN vendors v ON v.id = vo.vendor_id
    LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id
    LEFT JOIN fee_invoices fi ON fi.id = vo.fee_invoice_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
      AND public.order_is_placed(o.payment_method, o.payment_status)
  ),
  -- Refunds that reached the customer, per boutique order: cancellations
  -- directly; returns shared across their items' boutique orders by value.
  cancel_refunds AS (
    SELECT oc.vendor_order_id AS vo_id, sum(r.amount) AS amt
    FROM order_cancellations oc JOIN refunds r ON r.id = oc.refund_id
    WHERE r.status = 'processed' AND oc.vendor_order_id IN (SELECT id FROM base)
    GROUP BY oc.vendor_order_id
  ),
  return_items AS (
    SELECT r.id AS refund_id, r.amount, oi.vendor_order_id AS vo_id,
           oi.price * coalesce((elem->>'quantity')::int, oi.quantity) AS item_value
    FROM refunds r
    JOIN return_requests rr ON rr.id = r.return_request_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(rr.items, '[]'::jsonb)) AS elem
    JOIN order_items oi ON oi.id = (elem->>'order_item_id')::uuid
    WHERE r.status = 'processed' AND oi.vendor_order_id IN (SELECT id FROM base)
  ),
  return_refunds AS (
    SELECT ri.vo_id, sum(ri.amount * ri.item_value / nullif(t.total_value, 0)) AS amt
    FROM return_items ri
    JOIN (SELECT refund_id, sum(item_value) AS total_value FROM return_items GROUP BY refund_id) t ON t.refund_id = ri.refund_id
    GROUP BY ri.vo_id
  ),
  calc AS (
    SELECT b.*,
           round(coalesce(cr.amt, 0) + coalesce(rf.amt, 0), 2) AS refunded_amt,
           (b.status = 'cancelled') AS is_cancelled
    FROM base b
    LEFT JOIN cancel_refunds cr ON cr.vo_id = b.id
    LEFT JOIN return_refunds rf ON rf.vo_id = b.id
  ),
  taxed AS (
    SELECT c.*,
           CASE WHEN c.is_cancelled THEN 0
                ELSE greatest(0, c.product_value - CASE WHEN c.goods_value > 0
                     THEN round(least(c.refunded_amt, c.goods_value) * c.product_value / c.goods_value, 2) ELSE 0 END)
           END AS net_tax
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
         CASE WHEN t.is_cancelled THEN 0 ELSE t.fee_gst_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.gateway_fee_amount END,
         t.courier_charge,
         CASE WHEN coalesce(t.customer_cod, 0) > 0 THEN 0 ELSE t.cod_handling_charge END,
         t.refunded_amt, t.net_tax,
         t.tcs_rate,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN round(t.net_tax * t.tcs_rate / 100, 2) - round(t.net_tax * t.tcs_rate / 200, 2) ELSE 0 END,
         CASE WHEN t.supply_type = 'intra_state' THEN 0 ELSE round(t.net_tax * t.tcs_rate / 100, 2) END,
         t.tds_rate,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.tds_amount END,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.net_payable END,
         CASE WHEN coalesce(t.rzp_settled_at, t.manual_paid_at) IS NOT NULL THEN 'paid'
              WHEN t.rzp_transfer_status = 'released' THEN 'sent'
              ELSE 'pending' END,
         (coalesce(t.rzp_settled_at, t.manual_paid_at) AT TIME ZONE 'Asia/Kolkata')::date,
         coalesce(t.rzp_settlement_utr, t.manual_utr),
         t.fee_inv,
         CASE WHEN t.is_cancelled THEN 0 ELSE t.disc_share END,
         CASE WHEN t.is_cancelled OR NOT t.shipping_to_boutique THEN 0 ELSE coalesce(t.shipping_cost, 0) END
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$function$;
