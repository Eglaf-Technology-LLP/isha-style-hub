-- Checkout will call adjust_stock with whatever variant id a cart line item
-- carries. Until ProductCard's quick-add is fixed to stop faking one for
-- variant-having products, some of those ids won't correspond to any real
-- product_variants row. Rather than making checkout depend on that fix
-- landing first, adjust_stock now falls back to the product's own aggregate
-- stock_quantity whenever the given variant id doesn't exist - so it does the
-- right thing regardless of which cart entry point produced the line item.
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
  v_variant_id UUID;
BEGIN
  PERFORM set_config('app.bypass_stock_protection', 'true', true);

  SELECT vendor_id, name INTO v_vendor_id, v_product_name
  FROM public.products WHERE id = _product_id;

  SELECT id INTO v_variant_id
  FROM public.product_variants
  WHERE id = _variant_id AND product_id = _product_id;

  IF v_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET stock = stock + _delta
    WHERE id = v_variant_id AND stock + _delta >= 0
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
    _product_id, v_variant_id, v_vendor_id, _delta, v_resulting,
    _movement_type, _reason, _reference_order_id, auth.uid()
  );

  RETURN jsonb_build_object('resulting_quantity', v_resulting, 'product_name', v_product_name);
END;
$$;
