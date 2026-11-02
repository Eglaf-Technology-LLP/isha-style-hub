-- Customer wallet (2 Nov 2026). Money only ever comes in from a refund the
-- customer chose to take as wallet balance - a return that passed the
-- quality check, or a paid order cancelled - and it is only spent on
-- AllBoutiqs orders (up to the whole order). No top-ups, no withdrawal to a
-- bank, no transfers between customers: that keeps it a closed-system
-- prepaid instrument, which needs no RBI licence.
--
-- The other refund options stay as they were: a prepaid order goes back to
-- the original card/UPI through Razorpay; a Cash on Delivery order is paid
-- by bank transfer by hand, once the customer emails their bank details.

-- ---------------------------------------------------------------------------
-- 1. The ledger: one row per credit or debit, never edited. Balance = sum.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  -- return_refund / cancellation_refund: money in from a refund.
  -- order_payment: spent at checkout (negative).
  -- order_payment_released: an unpaid checkout's wallet part given back.
  -- adjustment: an admin correction, always with a note.
  kind text NOT NULL CHECK (kind IN ('return_refund', 'cancellation_refund', 'order_payment',
                                     'order_payment_released', 'adjustment')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  vendor_order_id uuid REFERENCES public.vendor_orders(id) ON DELETE SET NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- One row per real-world event, so a retried call can't pay twice.
  source_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order ON public.wallet_transactions(order_id);

-- Read-only to customers (their own) and admins; written only by the
-- functions below.
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view their own wallet"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.wallet_balance(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(amount), 0)::numeric(12,2) FROM public.wallet_transactions WHERE user_id = _user_id;
$$;
REVOKE ALL ON FUNCTION public.wallet_balance(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.my_wallet_balance()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.wallet_balance(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.my_wallet_balance() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_wallet_balance() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Orders paid (partly or wholly) from the wallet
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wallet_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (wallet_amount >= 0);

-- 'wallet': the wallet covered the whole order, nothing else was charged.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cod', 'stripe', 'razorpay', 'wallet'));

-- Checkout writes the order and payment rows from the browser. Nothing
-- stopped those rows arriving already "paid" - harmless while the only
-- refund was a Razorpay one (Razorpay won't refund a payment it never
-- took), but a wallet refund has no such outside check. Paid, and wallet
-- amounts, are only ever set by the server.
CREATE OR REPLACE FUNCTION public.guard_new_order_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.payment_status := 'pending';
    NEW.order_status := 'pending';
    NEW.wallet_amount := 0;
    NEW.razorpay_payment_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_new_order_payment_trigger ON public.orders;
CREATE TRIGGER guard_new_order_payment_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_order_payment();

CREATE OR REPLACE FUNCTION public.guard_new_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.payment_status := 'pending';
    NEW.transaction_id := NULL;
    NEW.refund_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_new_payment_trigger ON public.payments;
CREATE TRIGGER guard_new_payment_trigger
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_payment();

-- Checkout, after saving the order: take _amount from the customer's wallet
-- for it. All of it or nothing - the browser already asked Razorpay for the
-- rest, so a balance that changed in the meantime stops the order instead.
-- A whole-wallet order is paid there and then (announce_paid_online_order
-- then tells the boutiques and emails the customer).
CREATE OR REPLACE FUNCTION public.apply_wallet_to_order(_order_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  v_balance numeric;
BEGIN
  _amount := round(coalesce(_amount, 0), 2);
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Nothing to pay from the wallet';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.order_status <> 'pending' OR o.payment_status <> 'pending' OR o.wallet_amount > 0
     OR o.created_at < now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'This order can no longer be paid from the wallet';
  END IF;
  IF o.payment_method = 'cod' THEN
    RAISE EXCEPTION 'Wallet balance can''t be combined with Cash on Delivery - pay the rest online';
  END IF;
  IF _amount > o.total THEN
    RAISE EXCEPTION 'That is more than the order total';
  END IF;
  IF (o.payment_method = 'wallet') <> (_amount = o.total) THEN
    RAISE EXCEPTION 'The wallet amount doesn''t match how this order is being paid';
  END IF;

  -- One spend at a time per customer, so two open checkouts can't both
  -- spend the same balance.
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || o.user_id::text, 0));
  v_balance := public.wallet_balance(o.user_id);
  IF _amount > v_balance THEN
    RAISE EXCEPTION 'Your wallet balance is now Rs %. Please check your order and try again.', v_balance;
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount, kind, order_id, created_by, source_key)
  VALUES (o.user_id, -_amount, 'order_payment', o.id, auth.uid(), 'order_payment:' || o.id);

  IF o.payment_method = 'wallet' THEN
    UPDATE public.payments SET amount = _amount, payment_status = 'paid'
    WHERE order_id = o.id AND payment_status = 'pending';
    UPDATE public.orders SET wallet_amount = _amount, payment_status = 'paid' WHERE id = o.id;
  ELSE
    -- The payment row is what Razorpay is charging: the rest.
    UPDATE public.payments SET amount = o.total - _amount
    WHERE order_id = o.id AND payment_status = 'pending';
    UPDATE public.orders SET wallet_amount = _amount WHERE id = o.id;
  END IF;
  RETURN _amount;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_wallet_to_order(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_wallet_to_order(uuid, numeric) TO authenticated;

-- What the customer has actually paid on an order (wallet + online, or the
-- COD cash once a parcel was delivered), less what has already gone back
-- to them. Refunds to the wallet can never exceed it.
CREATE OR REPLACE FUNCTION public.order_refundable_amount(_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  v_wallet numeric;
  v_other numeric := 0;
  v_refunded numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Net wallet spend (a released checkout's spend was given back).
  SELECT coalesce(-sum(amount), 0) INTO v_wallet
  FROM public.wallet_transactions
  WHERE order_id = o.id AND kind IN ('order_payment', 'order_payment_released');

  IF o.payment_method = 'cod' THEN
    IF o.payment_status = 'paid' OR EXISTS (
      SELECT 1 FROM public.vendor_orders
      WHERE order_id = o.id AND (delivered_at IS NOT NULL OR cod_received_at IS NOT NULL)) THEN
      v_other := o.total - o.wallet_amount;
    END IF;
  ELSIF o.payment_method <> 'wallet' THEN
    SELECT coalesce(sum(amount), 0) INTO v_other
    FROM public.payments
    WHERE order_id = o.id AND payment_status IN ('paid', 'partially_refunded', 'refunded');
  END IF;

  SELECT coalesce((SELECT sum(amount) FROM public.refunds
                   WHERE order_id = o.id AND status IN ('initiated', 'processing', 'processed')), 0)
       + coalesce((SELECT sum(amount) FROM public.wallet_transactions
                   WHERE order_id = o.id AND kind IN ('return_refund', 'cancellation_refund')), 0)
  INTO v_refunded;

  RETURN greatest(round(v_wallet + v_other - v_refunded, 2), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.order_refundable_amount(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_refundable_amount(uuid) TO service_role;

-- A refund into the order's customer's wallet. Server only (edge functions
-- decide when a refund is due). Calling again with the same _source_key
-- returns the first credit instead of paying twice.
CREATE OR REPLACE FUNCTION public.wallet_refund(
  _order_id uuid,
  _amount numeric,
  _kind text,
  _source_key text,
  _return_request_id uuid DEFAULT NULL,
  _vendor_order_id uuid DEFAULT NULL,
  _note text DEFAULT NULL,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  v_id uuid;
  v_left numeric;
BEGIN
  _amount := round(coalesce(_amount, 0), 2);
  IF _amount <= 0 THEN RAISE EXCEPTION 'A positive amount is required'; END IF;
  IF _kind NOT IN ('return_refund', 'cancellation_refund') THEN RAISE EXCEPTION 'Not a refund: %', _kind; END IF;
  IF coalesce(_source_key, '') = '' THEN RAISE EXCEPTION 'A source key is required'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT id INTO v_id FROM public.wallet_transactions WHERE source_key = _source_key;
  IF FOUND THEN RETURN v_id; END IF;

  IF o.user_id IS NULL THEN RAISE EXCEPTION 'This order has no customer account to refund into'; END IF;
  v_left := public.order_refundable_amount(o.id);
  IF _amount > v_left THEN
    RAISE EXCEPTION 'Refund of Rs % is more than is left to refund on this order (Rs %)', _amount, v_left;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, amount, kind, order_id, return_request_id, vendor_order_id, note, created_by, source_key)
  VALUES (o.user_id, _amount, _kind, o.id, _return_request_id, _vendor_order_id, _note, _created_by, _source_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_refund(uuid, numeric, text, text, uuid, uuid, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_refund(uuid, numeric, text, text, uuid, uuid, text, uuid) TO service_role;

-- Admin correction (a goodwill credit, or taking back a mistaken one).
-- Never below zero.
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_user_id uuid, _amount numeric, _note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admins can adjust a wallet'; END IF;
  _amount := round(coalesce(_amount, 0), 2);
  IF _amount = 0 THEN RAISE EXCEPTION 'Enter an amount'; END IF;
  IF coalesce(trim(_note), '') = '' THEN RAISE EXCEPTION 'Say why the wallet is being adjusted'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet:' || _user_id::text, 0));
  IF public.wallet_balance(_user_id) + _amount < 0 THEN
    RAISE EXCEPTION 'The wallet only holds Rs %', public.wallet_balance(_user_id);
  END IF;
  INSERT INTO public.wallet_transactions (user_id, amount, kind, note, created_by, source_key)
  VALUES (_user_id, _amount, 'adjustment', trim(_note), auth.uid(), 'adjustment:' || gen_random_uuid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. An unpaid checkout gives its wallet part back (as before, plus that)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abandon_checkout(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  it record;
  v_was_open boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.payment_status IN ('paid', 'refunded') THEN
    RETURN false;
  END IF;
  v_was_open := o.order_status <> 'cancelled';

  PERFORM set_config('app.unpaid_checkout_release', 'on', true);
  UPDATE public.vendor_orders SET status = 'cancelled' WHERE order_id = o.id AND status <> 'cancelled';
  UPDATE public.orders
  SET order_status = 'cancelled',
      payment_status = CASE WHEN payment_method <> 'cod' AND payment_status = 'pending' THEN 'failed' ELSE payment_status END
  WHERE id = o.id;
  UPDATE public.payments SET payment_status = 'failed' WHERE order_id = o.id AND payment_status = 'pending' AND o.payment_method <> 'cod';
  PERFORM set_config('app.unpaid_checkout_release', 'off', true);

  -- Whatever stock the checkout took and nothing has given back yet.
  FOR it IN
    SELECT product_id, variant_id, sum(change_quantity) AS net
    FROM public.stock_movements WHERE reference_order_id = o.id
    GROUP BY product_id, variant_id HAVING sum(change_quantity) < 0
  LOOP
    PERFORM public.adjust_stock(it.product_id, it.variant_id, (-it.net)::integer, 'return',
      'Payment not completed - stock released', o.id);
  END LOOP;

  -- The part the wallet was going to pay goes straight back.
  IF o.wallet_amount > 0 AND o.user_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (user_id, amount, kind, order_id, note, source_key)
    VALUES (o.user_id, o.wallet_amount, 'order_payment_released', o.id,
            'Payment not completed - wallet balance returned', 'order_payment_released:' || o.id)
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  IF v_was_open AND o.discount_code IS NOT NULL THEN
    UPDATE public.discounts SET used_count = used_count - 1
    WHERE upper(code) = upper(o.discount_code) AND used_count > 0;
  END IF;

  DELETE FROM public.notifications n
  WHERE n.type = 'new_order'
    AND EXISTS (SELECT 1 FROM public.vendor_orders vo WHERE vo.order_id = o.id AND n.link_url LIKE '%' || vo.id::text || '%');

  RETURN v_was_open;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Returns: the customer picks the refund method; 3 photos per item
-- ---------------------------------------------------------------------------
-- wallet: credited as soon as the items pass the quality check.
-- original: back to the card/UPI the order was paid with (prepaid orders).
-- bank: Cash on Delivery - the customer emails their bank details and the
--   team transfers it by hand within 5 working days.
ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS refund_method text CHECK (refund_method IN ('wallet', 'original', 'bank'));

ALTER TABLE public.order_cancellations
  ADD COLUMN IF NOT EXISTS refund_method text CHECK (refund_method IN ('wallet', 'original'));

-- A customer's request is checked against their own order: the order is
-- theirs, each item is on it, and its price is what the piece actually cost
-- them (less its share of any coupon) - not whatever the browser sent. The
-- refund amount is set by the team / the quality check, never the customer.
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
    NEW.items := (
      SELECT coalesce(jsonb_agg(
        e || jsonb_build_object(
          'price', round(oi.price - coalesce(oi.discount_amount, 0) / greatest(oi.quantity, 1), 2),
          'quantity', least(greatest(coalesce((e->>'quantity')::integer, oi.quantity), 1), oi.quantity))
        ORDER BY t.ord), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
      JOIN public.order_items oi ON oi.id::text = t.e->>'order_item_id'
    );
  END IF;

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

DROP TRIGGER IF EXISTS prepare_return_request_trigger ON public.return_requests;
CREATE TRIGGER prepare_return_request_trigger
  BEFORE INSERT ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.prepare_return_request();

-- Three photos of every item (front, back, the tag still attached) when
-- the admin setting asks for evidence. Was one.
CREATE OR REPLACE FUNCTION public.enforce_return_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF (SELECT return_evidence_required FROM public.platform_settings WHERE id)
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) AS it
       WHERE coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(it->'photo_urls') = 'array' THEN it->'photo_urls' END), 0) < 3
     ) THEN
    RAISE EXCEPTION 'Photo evidence is required: 3 photos of every item in a return or exchange request'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
