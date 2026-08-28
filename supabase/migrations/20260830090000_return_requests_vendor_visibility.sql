-- Vendors had zero visibility into returns/exchanges touching their own
-- products - confirmed absent, not just unbuilt (no RLS policy, no vendor
-- UI). return_requests.items is a JSON snapshot of order_item_ids (not a
-- live FK), so vendor attribution needs to unpack it and join through
-- order_items.vendor_id, mirroring the existing order_contains_vendor_sale
-- SECURITY DEFINER pattern used to avoid RLS recursion elsewhere.
CREATE OR REPLACE FUNCTION public.return_request_contains_vendor_item(_return_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.return_requests rr
    CROSS JOIN LATERAL jsonb_array_elements(rr.items) AS item
    JOIN public.order_items oi ON oi.id = (item->>'order_item_id')::uuid
    WHERE rr.id = _return_request_id
      AND public.is_vendor_member(_user_id, oi.vendor_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.return_request_contains_vendor_item(uuid, uuid) TO authenticated;

-- Additive alongside the existing customer/admin SELECT policies - a
-- vendor gets read visibility only, no new write/approval authority
-- (return/exchange approval stays admin-only, an already-settled decision).
CREATE POLICY "Vendors view return requests for their own items"
ON public.return_requests FOR SELECT
TO authenticated
USING (public.return_request_contains_vendor_item(id, auth.uid()));
