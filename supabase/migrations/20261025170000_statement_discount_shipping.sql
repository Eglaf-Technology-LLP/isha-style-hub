-- Extra list from the client (H + I): the boutique's Reports area shows,
-- for its completed orders, every amount between the sale and the payout -
-- the statement lines had all of them except the coupon share and the
-- shipping charge the boutique is credited with when it bears the courier.
-- Both added (at the end, so existing readers are unaffected). The return
-- type changes, so the function is dropped and created again.
DROP FUNCTION IF EXISTS public.statement_lines(uuid, date, date);

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
    SELECT vo.*, o.created_at AS order_created, o.payment_method AS pay_method,
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
         t.courier_charge, t.cod_handling_charge, t.refunded_amt, t.net_tax,
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

REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date) TO authenticated, service_role;
