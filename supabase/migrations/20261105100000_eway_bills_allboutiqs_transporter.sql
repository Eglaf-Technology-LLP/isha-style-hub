-- E-way bills, round 2 (Nov 2026): AllBoutiqs is now enrolled as a
-- transporter on the e-way bill portal, so it makes every boutique's e-way
-- bills itself. Replaces the sub-user / "boutique makes its own" set-up of
-- 20261103100000_eway_bills.sql.
--
-- * Requests are raised when the order is placed (not when the boutique
--   first presses Ship Now), so AllBoutiqs has them ready before the boutique
--   packs. The superadmin gets an email and a notification.
-- * AllBoutiqs is the transporter on every e-way bill, so the bill no longer
--   ties the booking to one courier.
-- * The superadmin downloads the open requests as one JSON file in the
--   portal's bulk format, uploads it on ewaybillgst.gov.in (Generate Bulk),
--   then enters the numbers in bulk and attaches the PDFs. The boutique is
--   emailed and can download / print the e-way bill from its Orders tab.
-- * Every movement over the limit gets its own e-way bill, including returns,
--   exchange replacements and send-backs to the boutique. Cancelling and
--   extending stay with the superadmin, who is reminded by the watcher below.
--
-- The old set-up table and columns are left in place (unused) so nothing
-- that reads them breaks; they can be dropped later.

-- ---------- settings ----------

ALTER TABLE public.platform_settings
  -- AllBoutiqs' transporter ID on the portal (its GSTIN or TRANSIN) - the
  -- transporter on every e-way bill.
  ADD COLUMN IF NOT EXISTS eway_bill_transporter_id text
    CHECK (eway_bill_transporter_id IS NULL OR eway_bill_transporter_id ~ '^[0-9A-Z]{15}$'),
  ADD COLUMN IF NOT EXISTS eway_bill_transporter_name text NOT NULL DEFAULT 'AllBoutiqs',
  -- The GSTIN / ID the portal account signs in with, when it differs from
  -- the transporter ID (the bulk file's userGstin).
  ADD COLUMN IF NOT EXISTS eway_bill_portal_user_id text
    CHECK (eway_bill_portal_user_id IS NULL OR eway_bill_portal_user_id ~ '^[0-9A-Z]{15}$');

-- ---------- e-way bills: more movements ----------

ALTER TABLE public.eway_bills DROP CONSTRAINT IF EXISTS eway_bills_leg_check;
ALTER TABLE public.eway_bills ADD CONSTRAINT eway_bills_leg_check CHECK (leg IN (
  'boutique_to_customer',   -- direct route, tax invoice
  'boutique_to_warehouse',  -- warehouse route, tax invoice (or challan for an exchange replacement)
  'warehouse_to_customer',  -- delivery challan (order, exchange replacement, failed return going back)
  'warehouse_to_boutique',  -- send-back (cancelled / RTO / returned / unused replacement)
  'customer_to_warehouse',  -- return / exchange pickup through the warehouse
  'customer_to_boutique'    -- return / exchange pickup straight to the boutique
));

ALTER TABLE public.eway_bills
  -- How the e-way bill is filed (portal codes): O outward / I inward;
  -- 1 Supply, 7 Sales Return, 8 Others (8 needs a description).
  ADD COLUMN IF NOT EXISTS supply_type text NOT NULL DEFAULT 'O' CHECK (supply_type IN ('O', 'I')),
  ADD COLUMN IF NOT EXISTS sub_supply_type smallint NOT NULL DEFAULT 1 CHECK (sub_supply_type BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS sub_supply_desc text,
  -- What the movement belongs to besides the order part itself.
  ADD COLUMN IF NOT EXISTS return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_id uuid REFERENCES public.boutique_send_backs(id) ON DELETE SET NULL,
  -- The goods on it, as they go in the portal's item list (a return carries
  -- only the returned lines): [{description, hsn_code, quantity,
  -- taxable_value, gst_rate, cgst_amount, sgst_amount, igst_amount, total}].
  ADD COLUMN IF NOT EXISTS items jsonb,
  ADD COLUMN IF NOT EXISTS taxable_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS cgst_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS sgst_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS igst_amount numeric(12,2),
  -- The portal's PDF (bucket eway-bills, <vendor_id>/<id>.pdf).
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at timestamptz,
  -- Put in a bulk JSON download (so the same request isn't uploaded twice).
  ADD COLUMN IF NOT EXISTS exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS exported_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS extended_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_extended_at timestamptz,
  -- When the watcher last chased an admin about it.
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_alerted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_eway_bills_return_request ON public.eway_bills(return_request_id) WHERE return_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eway_bills_send_back ON public.eway_bills(send_back_id) WHERE send_back_id IS NOT NULL;

-- One open request per part, leg and return / send-back.
DROP INDEX IF EXISTS public.eway_bills_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS eway_bills_one_pending ON public.eway_bills (
  vendor_order_id, leg, coalesce(return_request_id, send_back_id, '00000000-0000-0000-0000-000000000000'::uuid)
) WHERE status = 'pending';

-- Requests raised by the system (order placed, watcher) have no requester.
-- (requested_by was already nullable.)

-- Rows made before this migration: their goods and tax are the invoice's.
UPDATE public.eway_bills b
SET items = l.items,
    taxable_value = i.taxable_value,
    cgst_amount = i.cgst_amount,
    sgst_amount = i.sgst_amount,
    igst_amount = i.igst_amount,
    sub_supply_type = CASE WHEN b.document_type = 'delivery_challan' THEN 8 ELSE 1 END,
    sub_supply_desc = CASE WHEN b.document_type = 'delivery_challan' THEN 'Fulfilment delivery' ELSE NULL END
FROM public.invoices i
CROSS JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'description', il.description, 'hsn_code', il.hsn_code, 'quantity', il.quantity,
           'taxable_value', il.taxable_value, 'gst_rate', il.gst_rate, 'cgst_amount', il.cgst_amount,
           'sgst_amount', il.sgst_amount, 'igst_amount', il.igst_amount, 'total', il.total
         ) ORDER BY il.line_no) AS items
  FROM public.invoice_lines il WHERE il.invoice_id = i.id
) l
WHERE i.id = b.invoice_id AND b.items IS NULL;

-- Delivery challans now also carry returns and send-backs.
ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_id uuid REFERENCES public.boutique_send_backs(id) ON DELETE SET NULL;

-- ---------- the portal's PDF ----------

-- Private, PDFs only. Admins upload; the boutique, admins and the warehouse
-- read. Path: <vendor_id>/<eway_bill_id>.pdf.

-- Whether the user belongs to the boutique a storage folder is named after.
-- Compared as text (a folder that isn't a uuid must not error) and as
-- definer, so vendor_members' own policies don't matter here.
CREATE OR REPLACE FUNCTION public.is_vendor_member_of_folder(_user_id uuid, _folder text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM vendor_members m WHERE m.user_id = _user_id AND m.vendor_id::text = _folder);
$$;
REVOKE ALL ON FUNCTION public.is_vendor_member_of_folder(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_vendor_member_of_folder(uuid, text) TO authenticated;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('eway-bills', 'eway-bills', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "Admins upload e-way bill PDFs" ON storage.objects;
CREATE POLICY "Admins upload e-way bill PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'eway-bills' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins replace e-way bill PDFs" ON storage.objects;
CREATE POLICY "Admins replace e-way bill PDFs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'eway-bills' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'eway-bills' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete e-way bill PDFs" ON storage.objects;
CREATE POLICY "Admins delete e-way bill PDFs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'eway-bills' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Boutique, admins and warehouse read e-way bill PDFs" ON storage.objects;
CREATE POLICY "Boutique, admins and warehouse read e-way bill PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'eway-bills'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.can_operate_warehouse(auth.uid())
      OR public.is_vendor_member_of_folder(auth.uid(), (storage.foldername(name))[1])
    )
  );

-- ---------- what still needs a request ----------

-- Order parts over the limit with no e-way bill asked for yet, for the
-- watcher (eway-bill-actions "watch"): the boutique's own leg once the order
-- is placed, and the warehouse's leg once a part has passed inspection there.
-- The booking screens still ask for any that slip through.
CREATE OR REPLACE FUNCTION public.eway_bill_missing_requests()
RETURNS TABLE (vendor_order_id uuid, leg text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT eway_bill_threshold AS limit_value FROM platform_settings LIMIT 1)
  SELECT vo.id,
         CASE WHEN o.fulfilment_route = 'warehouse' AND o.warehouse_id IS NOT NULL
              THEN 'boutique_to_warehouse' ELSE 'boutique_to_customer' END
  FROM vendor_orders vo
  JOIN orders o ON o.id = vo.order_id
  CROSS JOIN s
  WHERE vo.status IN ('pending', 'confirmed', 'processing')
    AND vo.created_at > now() - interval '14 days'
    AND public.order_id_is_placed(vo.order_id)
    AND NOT EXISTS (
      SELECT 1 FROM eway_bills b
      WHERE b.vendor_order_id = vo.id AND b.leg IN ('boutique_to_customer', 'boutique_to_warehouse')
        AND b.return_request_id IS NULL AND b.status <> 'cancelled'
    )
    AND NOT EXISTS (
      SELECT 1 FROM shipments sh
      WHERE sh.vendor_order_id = vo.id AND sh.shipment_type IN ('forward', 'to_warehouse')
        AND sh.return_request_id IS NULL AND sh.status <> 'cancelled' AND sh.awb_code IS NOT NULL
    )
    AND public.vendor_order_invoice_value(vo.id) > s.limit_value
  UNION ALL
  SELECT vo.id, 'warehouse_to_customer'
  FROM vendor_orders vo
  CROSS JOIN s
  WHERE vo.status = 'at_warehouse' AND vo.qc_status = 'passed'
    AND (vo.dispatch_id IS NULL OR EXISTS (
      SELECT 1 FROM warehouse_dispatches d WHERE d.id = vo.dispatch_id AND d.status = 'packing'
    ))
    AND NOT EXISTS (
      SELECT 1 FROM eway_bills b
      WHERE b.vendor_order_id = vo.id AND b.leg = 'warehouse_to_customer'
        AND b.return_request_id IS NULL AND b.status <> 'cancelled'
        AND (b.shipment_id IS NULL OR EXISTS (
          SELECT 1 FROM shipments sh WHERE sh.id = b.shipment_id AND sh.status <> 'cancelled'
        ))
    )
    AND public.vendor_order_invoice_value(vo.id) > s.limit_value;
$$;
REVOKE ALL ON FUNCTION public.eway_bill_missing_requests() FROM public, anon, authenticated;

-- ---------- the watcher ----------

-- Every 15 minutes (and straight away when a part passes inspection at the
-- warehouse): raise missing requests, chase requests waiting over 2 hours,
-- e-way bills to cancel on the portal and ones about to run out.
SELECT cron.schedule('eway-bill-watch', '*/15 * * * *',
  $$SELECT public.invoke_edge_function('eway-bill-actions', '{"action":"watch"}'::jsonb);$$);

CREATE OR REPLACE FUNCTION public.eway_bill_watch_on_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qc_status = 'passed' AND OLD.qc_status IS DISTINCT FROM 'passed' THEN
    PERFORM public.invoke_edge_function('eway-bill-actions', jsonb_build_object('action', 'watch'));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS eway_bill_watch_on_inspection ON public.vendor_orders;
CREATE TRIGGER eway_bill_watch_on_inspection
  AFTER UPDATE OF qc_status ON public.vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.eway_bill_watch_on_inspection();

-- A cancelled part: open requests close (as before); an e-way bill already
-- made has to be cancelled on the portal within 24 hours of making it, so the
-- admins hear about it now rather than at the next watch.
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
    IF EXISTS (SELECT 1 FROM eway_bills WHERE vendor_order_id = NEW.id AND status = 'active' AND return_request_id IS NULL AND send_back_id IS NULL) THEN
      PERFORM public.invoke_edge_function('eway-bill-actions', jsonb_build_object('action', 'watch'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
