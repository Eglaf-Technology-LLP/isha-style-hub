-- Exchange orders address the seller's pickup/shipping location by a
-- numeric id (seller_pickup_location_id/seller_shipping_location_id),
-- distinct from the pickup_location name string used by addpickup and
-- the Forward wrapper - capture both on the vendor row.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_id integer;
