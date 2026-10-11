-- Statement & tax lines (step 11): one row per boutique order placed in a
-- date range, with every charge and tax, refunds, the net taxable value
-- after returns (the GST TCS base), payout status, payment date and UTR.
-- Boutiques get only their own rows; admins one boutique or all
-- (_vendor_id NULL). Summaries (monthly GST/TCS/TDS, quarterly TDS) are
-- built from these rows in the app.

CREATE OR REPLACE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date)
RETURNS TABLE (
  vendor_id uuid,
  boutique_code text,
  boutique_name text,
  vendor_order_id uuid,
  order_number text,
  order_date date,
  delivered_on date,
  status text,
  payment_method text,
  supply_type text,
  goods_value numeric,
  product_value numeric,
  gst numeric,
  commission numeric,
  tech_fee numeric,
  fee_gst numeric,
  gateway_fee numeric,
  courier numeric,
  cod_charge numeric,
  refunded numeric,
  net_taxable numeric,
  tcs_rate numeric,
  tcs_cgst numeric,
  tcs_sgst numeric,
  tcs_igst numeric,
  tds_rate numeric,
  tds numeric,
  net_payout numeric,
  payout_status text,
  payment_date date,
  utr text,
  fee_invoice_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           fi.invoice_number AS fee_inv
    FROM vendor_orders vo
    JOIN orders o ON o.id = vo.order_id
    JOIN vendors v ON v.id = vo.vendor_id
    LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id
    LEFT JOIN fee_invoices fi ON fi.id = vo.fee_invoice_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
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
         t.fee_inv
  FROM taxed t
  ORDER BY t.order_created, t.bname;
END;
$$;
REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date) TO authenticated;
