-- =====================================================================
-- AllBoutiqs LIVE database - STEP 2 of 5: basic settings
-- Project: allboutiqs-marketplace-live (whycxtnjhdbewgyugfax)
--
-- STEP 1 already added the warehouse, the 22 HSN codes, the Indian states,
-- the platform settings and the platform rates (the same as the old live
-- database). This adds the rest of the basic settings, as they were on the
-- old live database (bldkjzitutojvnbbljrf) on 2026-10-29:
--   * the 4 categories: Kurti, Lehenga, Sarees, Western Wear (with HSN codes)
--   * the 4 size charts: Kurti, Lehenga, Saree Blouse, Western Wear
--   * the launch date 2026-10-15 (used for Founding Boutiques - change it in
--     Admin later if the live launch date is different)
--
-- How to run: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run twice: rows that already exist are skipped.
-- =====================================================================

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.hsn_codes') IS NULL OR NOT EXISTS (SELECT 1 FROM public.hsn_codes) THEN
    RAISE EXCEPTION 'Run STEP 1 (01_schema.sql) first.';
  END IF;
END
$guard$;

INSERT INTO public.categories (name, slug, description, hsn_code_id)
SELECT v.name, v.slug, v.description, h.id FROM (VALUES
  ('Kurti', 'kurti', 'Traditional and contemporary kurtis', '6204'),
  ('Lehenga', 'lehenga', 'Festive and bridal lehengas', '6206'),
  ('Sarees', 'sarees', 'Traditional and contemporary sarees', '6204'),
  ('Western Wear', 'western-wear', 'Modern and stylish western wear', '6204')
) AS v(name, slug, description, hsn_code)
LEFT JOIN public.hsn_codes h ON h.code = v.hsn_code
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.size_guides (category_id, name, sizes, measurements, unit)
SELECT c.id, v.name, v.sizes, v.measurements, v.unit FROM (VALUES
  ('kurti', 'Kurti', '["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"]'::jsonb, '[{"key": "bust", "hint": "Around the fullest part of the chest, tape level", "name": "Bust", "values": {"L": "38", "M": "36", "S": "34", "XL": "40", "XS": "32", "3XL": "44", "4XL": "46", "5XL": "48", "6XL": "50", "XXL": "42"}}, {"key": "waist", "hint": "Around the natural waist, the narrowest part", "name": "Waist", "values": {"L": "32", "M": "30", "S": "28", "XL": "34", "XS": "26", "3XL": "38", "4XL": "40", "5XL": "42", "6XL": "44", "XXL": "36"}}, {"key": "hip", "hint": "Around the fullest part of the hips", "name": "Hip", "values": {"L": "42", "M": "40", "S": "38", "XL": "44", "XS": "36", "3XL": "48", "4XL": "50", "5XL": "52", "6XL": "54", "XXL": "46"}}, {"key": "shoulder", "hint": "Across the back, from one shoulder edge to the other", "name": "Shoulder", "values": {}}, {"key": "sleeve_length", "hint": "From the shoulder edge down to where the sleeve should end", "name": "Sleeve length", "values": {}}, {"key": "length", "hint": "From the highest point of the shoulder down to the hem", "name": "Kurti length", "values": {}}]'::jsonb, 'in'::text),
  ('lehenga', 'Lehenga', '["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"]'::jsonb, '[{"key": "bust", "hint": "Around the fullest part of the chest, tape level", "name": "Bust", "values": {"L": "38", "M": "36", "S": "34", "XL": "40", "XS": "32", "3XL": "44", "4XL": "46", "5XL": "48", "6XL": "50", "XXL": "42"}}, {"key": "waist", "hint": "Around the natural waist, the narrowest part", "name": "Waist", "values": {"L": "32", "M": "30", "S": "28", "XL": "34", "XS": "26", "3XL": "38", "4XL": "40", "5XL": "42", "6XL": "44", "XXL": "36"}}, {"key": "hip", "hint": "Around the fullest part of the hips", "name": "Hip", "values": {"L": "42", "M": "40", "S": "38", "XL": "44", "XS": "36", "3XL": "48", "4XL": "50", "5XL": "52", "6XL": "54", "XXL": "46"}}, {"key": "shoulder", "hint": "Across the back, from one shoulder edge to the other", "name": "Shoulder", "values": {}}, {"key": "blouse_length", "hint": "From the highest point of the shoulder down to where the blouse should end", "name": "Blouse length", "values": {}}, {"key": "skirt_waist", "hint": "Around the waist where the lehenga will sit", "name": "Skirt waist", "values": {}}, {"key": "skirt_length", "hint": "From where the lehenga sits on the waist down to the floor, with footwear", "name": "Skirt length", "values": {}}]'::jsonb, 'in'::text),
  ('sarees', 'Saree Blouse', '["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"]'::jsonb, '[{"key": "bust", "hint": "Around the fullest part of the chest, tape level", "name": "Bust", "values": {"L": "38", "M": "36", "S": "34", "XL": "40", "XS": "32", "3XL": "44", "4XL": "46", "5XL": "48", "6XL": "50", "XXL": "42"}}, {"key": "under_bust", "hint": "Around the ribcage just below the bust", "name": "Under-bust", "values": {}}, {"key": "waist", "hint": "Around the natural waist, the narrowest part", "name": "Waist", "values": {"L": "32", "M": "30", "S": "28", "XL": "34", "XS": "26", "3XL": "38", "4XL": "40", "5XL": "42", "6XL": "44", "XXL": "36"}}, {"key": "shoulder", "hint": "Across the back, from one shoulder edge to the other", "name": "Shoulder", "values": {}}, {"key": "armhole", "hint": "Around the arm at the shoulder joint", "name": "Armhole", "values": {}}, {"key": "sleeve_length", "hint": "From the shoulder edge down to where the sleeve should end", "name": "Sleeve length", "values": {}}, {"key": "blouse_length", "hint": "From the highest point of the shoulder down to where the blouse should end", "name": "Blouse length", "values": {}}]'::jsonb, 'in'::text),
  ('western-wear', 'Western Wear', '["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"]'::jsonb, '[{"key": "bust", "hint": "Around the fullest part of the chest, tape level", "name": "Bust", "values": {"L": "38", "M": "36", "S": "34", "XL": "40", "XS": "32", "3XL": "44", "4XL": "46", "5XL": "48", "6XL": "50", "XXL": "42"}}, {"key": "waist", "hint": "Around the natural waist, the narrowest part", "name": "Waist", "values": {"L": "32", "M": "30", "S": "28", "XL": "34", "XS": "26", "3XL": "38", "4XL": "40", "5XL": "42", "6XL": "44", "XXL": "36"}}, {"key": "hip", "hint": "Around the fullest part of the hips", "name": "Hip", "values": {"L": "42", "M": "40", "S": "38", "XL": "44", "XS": "36", "3XL": "48", "4XL": "50", "5XL": "52", "6XL": "54", "XXL": "46"}}, {"key": "shoulder", "hint": "Across the back, from one shoulder edge to the other", "name": "Shoulder", "values": {}}, {"key": "length", "hint": "From the highest point of the shoulder down to the hem", "name": "Length", "values": {}}]'::jsonb, 'in'::text)
) AS v(category_slug, name, sizes, measurements, unit)
LEFT JOIN public.categories c ON c.slug = v.category_slug
ON CONFLICT DO NOTHING;

UPDATE public.platform_settings SET launch_date = DATE '2026-10-15' WHERE id = true AND launch_date IS NULL;

COMMIT;

SELECT c.name AS category, h.code AS hsn_code, g.name AS size_chart
FROM public.categories c
LEFT JOIN public.hsn_codes h ON h.id = c.hsn_code_id
LEFT JOIN public.size_guides g ON g.category_id = c.id
ORDER BY c.name;
