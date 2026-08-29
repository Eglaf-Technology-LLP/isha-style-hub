-- Structural v1: numbering, a real per-vendor document, download access -
-- not yet a fully GST-compliant tax invoice (no HSN/CGST/SGST/IGST split,
-- no confirmed platform/vendor GST registration model). tax_amount stays
-- 0 until those business inputs are supplied; the template itself says so.
--
-- One invoice per vendor_order (not per order) - each vendor is the legal
-- seller of their own goods in this marketplace, so each gets their own
-- numbered document rather than one consolidated invoice per order.
-- Seller/buyer details are snapshotted at issue time rather than joined
-- live later, since a legal document must reflect its issue-time state
-- even if the vendor's GSTIN or the customer's address changes afterward.
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  vendor_order_id uuid NOT NULL UNIQUE REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  subtotal numeric NOT NULL,
  shipping_cost numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL,
  seller_name text NOT NULL,
  seller_gstin text,
  seller_address jsonb,
  billing_name text NOT NULL,
  billing_address jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX idx_invoices_vendor_id ON public.invoices(vendor_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view invoices on their own orders"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = invoices.order_id AND o.user_id = auth.uid()
  ));

CREATE POLICY "Vendors view invoices on their own sales"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.order_contains_vendor_sale(order_id, auth.uid()));

CREATE POLICY "Admins view all invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No authenticated write policy - service-role only (generate-invoice
-- function), same lockdown as every other audit/document table this project.

-- A single global, monotonic sequence rather than a hand-rolled per-vendor
-- COUNT(*), which would race under concurrent generation. The human-
-- readable number still embeds the vendor's own slug for attribution -
-- only the raw integer is shared across vendors, not the visible number.
CREATE SEQUENCE public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_seq()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('public.invoice_number_seq');
$$;
