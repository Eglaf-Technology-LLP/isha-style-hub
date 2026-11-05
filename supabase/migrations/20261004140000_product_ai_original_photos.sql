-- Original real-product photos a boutique must supply when it declares AI
-- imagery, so admins can check the product exists and matches. They're for
-- verification only, so they live in a PRIVATE bucket (not the public
-- category-images bucket every listing image uses): only the owning
-- boutique's members and admins can read them, via short-lived signed URLs.
-- Paths are stored as <vendor_id or "platform">/<file>.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ai_original_photo_paths text[] NOT NULL DEFAULT '{}';

-- Backstop for the form-level check: an AI-declared listing can't be saved
-- without at least one original. NULL (legacy, undeclared) and 'none' are fine.
ALTER TABLE public.products
  ADD CONSTRAINT products_ai_original_photo_required
  CHECK (
    ai_content_status IS NULL
    OR ai_content_status = 'none'
    OR cardinality(ai_original_photo_paths) > 0
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-originals', 'product-originals', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_product_original(_user_id uuid, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.vendor_members vm
      WHERE vm.user_id = _user_id
        AND vm.vendor_id::text = (storage.foldername(_object_name))[1]
    );
$$;

CREATE POLICY "Product originals: owning boutique and admins can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-originals' AND public.can_access_product_original(auth.uid(), name));

CREATE POLICY "Product originals: owning boutique and admins can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-originals' AND public.can_access_product_original(auth.uid(), name));

CREATE POLICY "Product originals: owning boutique and admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-originals' AND public.can_access_product_original(auth.uid(), name));
