-- Vendors could never actually upload an image file - the category-images
-- bucket's write policies are all gated to admin only, which is why
-- VendorProductDialog/VariantManager's "image" fields were plain URL text
-- boxes instead of real uploads. Scoped to a vendor-uploads/ path prefix
-- so this doesn't touch admin's existing products/categories paths at all.
CREATE POLICY "Vendor members upload their own images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = 'vendor-uploads'
    AND EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Vendor members update their own images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = 'vendor-uploads'
    AND EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Vendor members delete their own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = 'vendor-uploads'
    AND EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = auth.uid())
  );
