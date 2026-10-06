-- Pickup-cancelled alerts quoted the internal vendor-order id ("#FA180432"),
-- which boutiques never see; their Orders list shows the customer order id.
-- Rewrite already-sent alerts to the order number they can actually find.
UPDATE public.notifications n
SET body = replace(n.body, '#' || upper(left(vo.id::text, 8)), '#' || left(vo.order_id::text, 8))
FROM public.vendor_orders vo
WHERE n.type = 'pickup_cancelled'
  AND n.body LIKE '%#' || upper(left(vo.id::text, 8)) || '%';
