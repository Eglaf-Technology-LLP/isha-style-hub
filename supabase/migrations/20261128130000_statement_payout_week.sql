-- Weekly statement = the payout week (client C19, 28 Nov 2026): payout every
-- Wednesday, weekly cut-off Tuesday 23:59 IST (platform_rates, unchanged), so
-- an order is in a week's payout when it was delivered by Monday 23:59 and
-- its 24-hour window closed before the cut-off. Admin > Payouts > Download
-- statement and the boutique's Payouts statement pick the payout Wednesday:
-- "Payout Wed 25 Nov 2026 - orders Wed 18 Nov to Tue 24 Nov".
--
-- statement_lines and money_checks take _payout_day (that Wednesday). Set,
-- they take the orders of that payout instead of the orders placed in
-- _from.._to: an order's payout day is its batch's date (vendor_payouts -
-- prepared on the Wednesday, or later that week when run by hand), else the
-- Wednesday it becomes payable (payout_eligible_on), so every order is in
-- exactly one week. money_checks' transfer check takes that week's batches;
-- its fee-invoice and return checks stay on _from.._to (the Wed-Tue dates).
-- Left out (NULL), both work by order date as before: Daily, Monthly,
-- Quarterly, Financial year and Custom dates.
--
-- As 20261110180000_paisa_exact, plus _payout_day. A new argument makes a new
-- function, so the old ones are dropped first; a call without it still works.

DROP FUNCTION IF EXISTS public.statement_lines(uuid, date, date);
DROP FUNCTION IF EXISTS public.money_checks(uuid, date, date);

CREATE FUNCTION public.statement_lines(_vendor_id uuid, _from date, _to date, _payout_day date DEFAULT NULL)
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
      AND CASE WHEN _payout_day IS NULL
               THEN (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
               ELSE coalesce(vp.payout_date, vo.payout_eligible_on) BETWEEN _payout_day AND _payout_day + 6
          END
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

CREATE FUNCTION public.money_checks(_vendor_id uuid, _from date, _to date, _payout_day date DEFAULT NULL)
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
    LEFT JOIN vendor_payouts vp ON vp.id = vo.payout_id
    WHERE (_vendor_id IS NULL OR vo.vendor_id = _vendor_id)
      AND CASE WHEN _payout_day IS NULL
               THEN (o.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN _from AND _to
               ELSE coalesce(vp.payout_date, vo.payout_eligible_on) BETWEEN _payout_day AND _payout_day + 6
          END
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
  WHERE (_vendor_id IS NULL OR vp.vendor_id = _vendor_id)
    AND CASE WHEN _payout_day IS NULL THEN vp.payout_date BETWEEN _from AND _to
             ELSE vp.payout_date BETWEEN _payout_day AND _payout_day + 6 END
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

REVOKE ALL ON FUNCTION public.statement_lines(uuid, date, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.statement_lines(uuid, date, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.money_checks(uuid, date, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.money_checks(uuid, date, date, date) TO authenticated, service_role;
