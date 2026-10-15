-- Size charts (2026-10-16). AllBoutiqs fixes one template per category -
-- which measurements (rows) and which sizes (columns) - and each boutique
-- fills in only the numbers for its own products in that category. No
-- approval: a boutique's chart shows on its product pages as soon as it's
-- saved. Inches throughout.
--
-- size_guides (unused until now) becomes the category template:
--   sizes        ["XS","S",...]
--   measurements [{key, name, hint, values}]  - key stays fixed if renamed;
--                values = optional AllBoutiqs standard numbers per size.
-- vendor_size_charts holds a boutique's numbers: values {measurementKey: {size: "34"}}.

ALTER TABLE public.size_guides
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'in' CHECK (unit IN ('in', 'cm'));
CREATE UNIQUE INDEX IF NOT EXISTS size_guides_one_per_category ON public.size_guides (category_id) WHERE category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_size_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(values) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, category_id)
);
ALTER TABLE public.vendor_size_charts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view size charts" ON public.vendor_size_charts FOR SELECT USING (true);
CREATE POLICY "Boutiques manage their own size charts" ON public.vendor_size_charts FOR ALL TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS update_vendor_size_charts_updated_at ON public.vendor_size_charts;
CREATE TRIGGER update_vendor_size_charts_updated_at
  BEFORE UPDATE ON public.vendor_size_charts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Starting templates for the current categories (admins can change them).
WITH t(slug, name, measurements) AS (
  VALUES
  ('kurti', 'Kurti', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"hip","name":"Hip","hint":"Around the fullest part of the hips","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"sleeve_length","name":"Sleeve length","hint":"From the shoulder edge down to where the sleeve should end","values":{}},
    {"key":"length","name":"Kurti length","hint":"From the highest point of the shoulder down to the hem","values":{}}
  ]'::jsonb),
  ('lehenga', 'Lehenga', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"hip","name":"Hip","hint":"Around the fullest part of the hips","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"blouse_length","name":"Blouse length","hint":"From the highest point of the shoulder down to where the blouse should end","values":{}},
    {"key":"skirt_waist","name":"Skirt waist","hint":"Around the waist where the lehenga will sit","values":{}},
    {"key":"skirt_length","name":"Skirt length","hint":"From where the lehenga sits on the waist down to the floor, with footwear","values":{}}
  ]'::jsonb),
  ('sarees', 'Saree blouse', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"under_bust","name":"Under-bust","hint":"Around the ribcage just below the bust","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"armhole","name":"Armhole","hint":"Around the arm at the shoulder joint","values":{}},
    {"key":"sleeve_length","name":"Sleeve length","hint":"From the shoulder edge down to where the sleeve should end","values":{}},
    {"key":"blouse_length","name":"Blouse length","hint":"From the highest point of the shoulder down to where the blouse should end","values":{}}
  ]'::jsonb),
  ('western-wear', 'Western wear', '[
    {"key":"bust","name":"Bust","hint":"Around the fullest part of the chest, tape level","values":{}},
    {"key":"waist","name":"Waist","hint":"Around the natural waist, the narrowest part","values":{}},
    {"key":"hip","name":"Hip","hint":"Around the fullest part of the hips","values":{}},
    {"key":"shoulder","name":"Shoulder","hint":"Across the back, from one shoulder edge to the other","values":{}},
    {"key":"length","name":"Length","hint":"From the highest point of the shoulder down to the hem","values":{}}
  ]'::jsonb)
)
INSERT INTO public.size_guides (category_id, name, sizes, measurements, unit)
SELECT c.id, t.name, '["XS","S","M","L","XL","XXL"]'::jsonb, t.measurements, 'in'
FROM t JOIN public.categories c ON c.slug = t.slug
WHERE NOT EXISTS (SELECT 1 FROM public.size_guides g WHERE g.category_id = c.id);
