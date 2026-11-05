-- Warehouse staff pre-fill the customer parcel's weight and size from the
-- boutiques' product entries (Developer Corrections Part 7, 8.2). They could
-- only read products that are live on the store, so a piece hidden or
-- unpublished after it was ordered fell back to default numbers.
DROP POLICY IF EXISTS "Warehouse reads products" ON public.products;
CREATE POLICY "Warehouse reads products"
  ON public.products FOR SELECT TO authenticated
  USING (public.can_operate_warehouse(auth.uid()));
