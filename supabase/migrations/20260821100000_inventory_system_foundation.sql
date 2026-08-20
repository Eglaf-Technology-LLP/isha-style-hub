-- Real inventory system: normalized variants (replacing the products.variants
-- jsonb blob, which two of the three product-edit surfaces never kept in sync
-- with stock_quantity), a real low_stock_threshold column (the old one never
-- existed - useLowStockAlerts.ts was reading/writing a column that isn't in
-- any migration, which is why every product silently defaulted to threshold
-- 10 and "Update Threshold" threw a DB error whenever clicked), and an
-- append-only stock_movements audit ledger.

CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  options JSONB NOT NULL DEFAULT '{}',
  price NUMERIC,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from the existing jsonb column before dropping it.
INSERT INTO public.product_variants (product_id, name, sku, options, price, stock)
SELECT
  p.id,
  COALESCE(elem->>'name', 'Default'),
  elem->>'sku',
  COALESCE(elem->'options', '{}'::jsonb),
  NULLIF(elem->>'price', '')::numeric,
  COALESCE((elem->>'stock')::integer, 0)
FROM public.products p, jsonb_array_elements(p.variants) elem
WHERE p.variants IS NOT NULL AND jsonb_array_length(p.variants) > 0;

ALTER TABLE public.products DROP COLUMN variants;
ALTER TABLE public.products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Mirrors the existing "Anyone can view approved products from approved
-- vendors" policy on products itself, just re-scoped through product_id.
CREATE POLICY "Anyone can view variants of approved products"
  ON public.product_variants FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND p.is_active = true
        AND p.approval_status = 'approved'
        AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = p.vendor_id AND v.status = 'approved')
    )
  );

CREATE POLICY "Vendor members and admins view all their variants"
  ON public.product_variants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (public.is_vendor_member(auth.uid(), p.vendor_id) OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Vendor members and admins manage variants"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (public.is_vendor_member(auth.uid(), p.vendor_id) OR public.has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (public.is_vendor_member(auth.uid(), p.vendor_id) OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- Append-only stock audit ledger, shaped like the existing loyalty_transactions
-- table (signed amount + type CHECK-enum + optional order_id FK + created_at
-- only, no updated_at - rows are immutable by convention).
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  change_quantity INTEGER NOT NULL,
  resulting_quantity INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'restock', 'manual_adjustment', 'return', 'correction')),
  reason TEXT,
  reference_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_variant_id ON public.stock_movements(variant_id);
CREATE INDEX idx_stock_movements_vendor_id ON public.stock_movements(vendor_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- No INSERT/UPDATE/DELETE policy for any client role, on purpose - the only
-- way a row is ever written is through adjust_stock() below (SECURITY DEFINER,
-- runs as the table owner and so isn't subject to this restriction), the same
-- "only this code path can write it" principle already used for
-- payments.payment_status in verify-razorpay-payment.
CREATE POLICY "Vendor members and admins view stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

-- Guards products.stock_quantity and product_variants.stock against direct
-- client writes, so VendorProductDialog (which today writes stock_quantity
-- directly and would otherwise silently desync it from variants, or bypass
-- the audit log entirely) can no longer change either column except through
-- adjust_stock(). Same "revert the protected field" shape as
-- protect_vendor_admin_fields, just gated on a transaction-local flag instead
-- of a role check.
CREATE OR REPLACE FUNCTION public.protect_stock_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_stock_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'products' THEN
    NEW.stock_quantity := OLD.stock_quantity;
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    NEW.stock := OLD.stock;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_products_stock_quantity
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.protect_stock_columns();

CREATE TRIGGER protect_product_variants_stock
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.protect_stock_columns();

-- The one legitimate way to change stock anywhere in the system: checkout
-- decrements, manual adjustments, and bulk updates all route through this.
-- Guarded UPDATE (stock + delta >= 0) both prevents overselling and gets
-- Postgres's row lock to make concurrent decrements race-safe for free - no
-- explicit SELECT ... FOR UPDATE needed. auth.uid() is read here rather than
-- accepted as a parameter so a caller can't lie about who made the change.
CREATE OR REPLACE FUNCTION public.adjust_stock(
  _product_id UUID,
  _variant_id UUID,
  _delta INTEGER,
  _movement_type TEXT,
  _reason TEXT,
  _reference_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resulting INTEGER;
  v_vendor_id UUID;
  v_variant_sum INTEGER;
  v_product_name TEXT;
BEGIN
  PERFORM set_config('app.bypass_stock_protection', 'true', true);

  SELECT vendor_id, name INTO v_vendor_id, v_product_name
  FROM public.products WHERE id = _product_id;

  IF _variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = stock + _delta
    WHERE id = _variant_id AND product_id = _product_id AND stock + _delta >= 0
    RETURNING stock INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;

    SELECT COALESCE(SUM(stock), 0) INTO v_variant_sum
    FROM public.product_variants WHERE product_id = _product_id;

    UPDATE public.products SET stock_quantity = v_variant_sum WHERE id = _product_id;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity + _delta
    WHERE id = _product_id AND stock_quantity + _delta >= 0
    RETURNING stock_quantity INTO v_resulting;

    IF v_resulting IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_product_name, 'this item');
    END IF;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, variant_id, vendor_id, change_quantity, resulting_quantity,
    movement_type, reason, reference_order_id, changed_by
  ) VALUES (
    _product_id, _variant_id, v_vendor_id, _delta, v_resulting,
    _movement_type, _reason, _reference_order_id, auth.uid()
  );

  RETURN jsonb_build_object('resulting_quantity', v_resulting, 'product_name', v_product_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, integer, text, text, uuid) TO anon, authenticated;
