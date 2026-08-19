-- Demo/sample data so a freshly provisioned database isn't empty.
-- Images are labeled placehold.co placeholders, not real product photography.
-- Safe to re-run: categories/vendor upsert on slug, products only seed once (guarded below).

INSERT INTO public.vendors (name, slug, description, status, is_trusted, commission_rate, shipping_flat_rate, free_shipping_threshold, return_window_days, return_policy, payout_account_status)
VALUES ('Isha Fashion Hub', 'isha-fashion-hub', 'The flagship store of Isha Fashion Hub.', 'approved', true, 10, 0, 999, 7, 'Easy 7-day returns. Items must be unused with tags intact.', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (name, slug, description, image_url) VALUES
('Sarees', 'sarees', 'Timeless drapes in silk, chiffon and Kanjivaram weaves.', 'https://placehold.co/1200x600/f6e3d3/7a2048?text=Sarees'),
('Lehengas', 'lehengas', 'Bridal and party-wear lehengas with intricate embroidery.', 'https://placehold.co/1200x600/fbe0ea/9c1750?text=Lehengas'),
('Kurtis', 'kurtis', 'Everyday and festive kurtis in cotton, rayon and georgette.', 'https://placehold.co/1200x600/e8ecd8/3f5930?text=Kurtis'),
('Western Wear', 'western-wear', 'Dresses, denims and shirts for a modern wardrobe.', 'https://placehold.co/1200x600/dbe7f0/1f3a5f?text=Western+Wear')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_id uuid;
  c_sarees uuid;
  c_lehengas uuid;
  c_kurtis uuid;
  c_western uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.products) THEN
    RETURN;
  END IF;

  SELECT id INTO v_id FROM public.vendors WHERE slug = 'isha-fashion-hub';
  SELECT id INTO c_sarees FROM public.categories WHERE slug = 'sarees';
  SELECT id INTO c_lehengas FROM public.categories WHERE slug = 'lehengas';
  SELECT id INTO c_kurtis FROM public.categories WHERE slug = 'kurtis';
  SELECT id INTO c_western FROM public.categories WHERE slug = 'western-wear';

  INSERT INTO public.products (category_id, vendor_id, name, description, price, compare_at_price, sku, stock_quantity, is_active, approval_status, images, variants) VALUES
  (c_sarees, v_id, 'Banarasi Silk Saree', 'Handwoven Banarasi silk saree with a gold zari border, perfect for weddings and festive occasions.', 4999, 6999, 'SAR-BAN-001', 22, true, 'approved',
    ARRAY['https://placehold.co/800x1000/f6e3d3/7a2048?text=Banarasi+Silk+Saree','https://placehold.co/800x1000/f6e3d3/7a2048?text=Banarasi+Silk+Saree+2'],
    '[{"id":"sar-ban-mar","name":"Maroon / Free Size","price":4999,"sku":"SAR-BAN-MAR","stock":12,"options":{"color":"Maroon","size":"Free Size"}},{"id":"sar-ban-blu","name":"Royal Blue / Free Size","price":4999,"sku":"SAR-BAN-BLU","stock":10,"options":{"color":"Royal Blue","size":"Free Size"}}]'::jsonb),

  (c_sarees, v_id, 'Chiffon Printed Saree', 'Lightweight chiffon saree with a floral print, ideal for everyday elegance.', 1899, NULL, 'SAR-CHF-001', 35, true, 'approved',
    ARRAY['https://placehold.co/800x1000/f6e3d3/7a2048?text=Chiffon+Printed+Saree','https://placehold.co/800x1000/f6e3d3/7a2048?text=Chiffon+Printed+Saree+2'],
    '[{"id":"sar-chf-pch","name":"Peach / Free Size","price":1899,"sku":"SAR-CHF-PCH","stock":18,"options":{"color":"Peach","size":"Free Size"}},{"id":"sar-chf-mnt","name":"Mint Green / Free Size","price":1899,"sku":"SAR-CHF-MNT","stock":17,"options":{"color":"Mint Green","size":"Free Size"}}]'::jsonb),

  (c_sarees, v_id, 'Kanjivaram Silk Saree', 'Traditional Kanjivaram silk saree with temple border, a heritage weave from Tamil Nadu.', 7499, 9999, 'SAR-KAN-001', 14, true, 'approved',
    ARRAY['https://placehold.co/800x1000/f6e3d3/7a2048?text=Kanjivaram+Silk+Saree','https://placehold.co/800x1000/f6e3d3/7a2048?text=Kanjivaram+Silk+Saree+2'],
    '[{"id":"sar-kan-gld","name":"Gold / Free Size","price":7499,"sku":"SAR-KAN-GLD","stock":7,"options":{"color":"Gold","size":"Free Size"}},{"id":"sar-kan-emd","name":"Emerald Green / Free Size","price":7499,"sku":"SAR-KAN-EMD","stock":7,"options":{"color":"Emerald Green","size":"Free Size"}}]'::jsonb),

  (c_lehengas, v_id, 'Bridal Embroidered Lehenga', 'Heavily embroidered bridal lehenga with zari and stone work, includes matching dupatta.', 15999, 19999, 'LEH-BRD-001', 18, true, 'approved',
    ARRAY['https://placehold.co/800x1000/fbe0ea/9c1750?text=Bridal+Lehenga','https://placehold.co/800x1000/fbe0ea/9c1750?text=Bridal+Lehenga+2'],
    '[{"id":"leh-brd-s","name":"Red / S","price":15999,"sku":"LEH-BRD-S","stock":5,"options":{"color":"Red","size":"S"}},{"id":"leh-brd-m","name":"Red / M","price":15999,"sku":"LEH-BRD-M","stock":7,"options":{"color":"Red","size":"M"}},{"id":"leh-brd-l","name":"Red / L","price":15999,"sku":"LEH-BRD-L","stock":6,"options":{"color":"Red","size":"L"}}]'::jsonb),

  (c_lehengas, v_id, 'Party Wear Net Lehenga', 'Sequinned net lehenga with a flared silhouette, designed for sangeet and cocktail parties.', 6499, NULL, 'LEH-PTY-001', 30, true, 'approved',
    ARRAY['https://placehold.co/800x1000/fbe0ea/9c1750?text=Party+Lehenga','https://placehold.co/800x1000/fbe0ea/9c1750?text=Party+Lehenga+2'],
    '[{"id":"leh-pty-pnk-s","name":"Pink / S","price":6499,"sku":"LEH-PTY-PNK-S","stock":6,"options":{"color":"Pink","size":"S"}},{"id":"leh-pty-pnk-m","name":"Pink / M","price":6499,"sku":"LEH-PTY-PNK-M","stock":8,"options":{"color":"Pink","size":"M"}},{"id":"leh-pty-trq-m","name":"Turquoise / M","price":6499,"sku":"LEH-PTY-TRQ-M","stock":8,"options":{"color":"Turquoise","size":"M"}},{"id":"leh-pty-trq-l","name":"Turquoise / L","price":6499,"sku":"LEH-PTY-TRQ-L","stock":8,"options":{"color":"Turquoise","size":"L"}}]'::jsonb),

  (c_lehengas, v_id, 'Georgette A-Line Lehenga', 'Flowy georgette A-line lehenga with subtle embroidery, comfortable for day-long functions.', 4299, NULL, 'LEH-GEO-001', 40, true, 'approved',
    ARRAY['https://placehold.co/800x1000/fbe0ea/9c1750?text=Georgette+Lehenga','https://placehold.co/800x1000/fbe0ea/9c1750?text=Georgette+Lehenga+2'],
    '[{"id":"leh-geo-s","name":"Mustard / S","price":4299,"sku":"LEH-GEO-S","stock":10,"options":{"color":"Mustard","size":"S"}},{"id":"leh-geo-m","name":"Mustard / M","price":4299,"sku":"LEH-GEO-M","stock":10,"options":{"color":"Mustard","size":"M"}},{"id":"leh-geo-l","name":"Mustard / L","price":4299,"sku":"LEH-GEO-L","stock":10,"options":{"color":"Mustard","size":"L"}},{"id":"leh-geo-xl","name":"Mustard / XL","price":4299,"sku":"LEH-GEO-XL","stock":10,"options":{"color":"Mustard","size":"XL"}}]'::jsonb),

  (c_kurtis, v_id, 'Cotton Printed Kurti', 'Breathable cotton kurti with block print, a wardrobe staple for daily wear.', 899, NULL, 'KUR-COT-001', 60, true, 'approved',
    ARRAY['https://placehold.co/800x1000/e8ecd8/3f5930?text=Cotton+Kurti','https://placehold.co/800x1000/e8ecd8/3f5930?text=Cotton+Kurti+2'],
    '[{"id":"kur-cot-wht-s","name":"White / S","price":899,"sku":"KUR-COT-WHT-S","stock":15,"options":{"color":"White","size":"S"}},{"id":"kur-cot-wht-m","name":"White / M","price":899,"sku":"KUR-COT-WHT-M","stock":15,"options":{"color":"White","size":"M"}},{"id":"kur-cot-ind-l","name":"Indigo / L","price":899,"sku":"KUR-COT-IND-L","stock":15,"options":{"color":"Indigo","size":"L"}},{"id":"kur-cot-ind-xl","name":"Indigo / XL","price":899,"sku":"KUR-COT-IND-XL","stock":15,"options":{"color":"Indigo","size":"XL"}}]'::jsonb),

  (c_kurtis, v_id, 'Anarkali Straight Kurti', 'Floor-length Anarkali kurti with delicate thread embroidery on the yoke.', 1499, NULL, 'KUR-ANA-001', 32, true, 'approved',
    ARRAY['https://placehold.co/800x1000/e8ecd8/3f5930?text=Anarkali+Kurti','https://placehold.co/800x1000/e8ecd8/3f5930?text=Anarkali+Kurti+2'],
    '[{"id":"kur-ana-s","name":"Wine / S","price":1499,"sku":"KUR-ANA-S","stock":8,"options":{"color":"Wine","size":"S"}},{"id":"kur-ana-m","name":"Wine / M","price":1499,"sku":"KUR-ANA-M","stock":8,"options":{"color":"Wine","size":"M"}},{"id":"kur-ana-l","name":"Wine / L","price":1499,"sku":"KUR-ANA-L","stock":8,"options":{"color":"Wine","size":"L"}},{"id":"kur-ana-xl","name":"Wine / XL","price":1499,"sku":"KUR-ANA-XL","stock":8,"options":{"color":"Wine","size":"XL"}}]'::jsonb),

  (c_kurtis, v_id, 'Rayon Flared Kurti', 'Soft rayon kurti with a flared hem and three-quarter sleeves.', 1199, 1599, 'KUR-RAY-001', 28, true, 'approved',
    ARRAY['https://placehold.co/800x1000/e8ecd8/3f5930?text=Rayon+Kurti','https://placehold.co/800x1000/e8ecd8/3f5930?text=Rayon+Kurti+2'],
    '[{"id":"kur-ray-olv-s","name":"Olive / S","price":1199,"sku":"KUR-RAY-OLV-S","stock":10,"options":{"color":"Olive","size":"S"}},{"id":"kur-ray-olv-m","name":"Olive / M","price":1199,"sku":"KUR-RAY-OLV-M","stock":9,"options":{"color":"Olive","size":"M"}},{"id":"kur-ray-blk-l","name":"Black / L","price":1199,"sku":"KUR-RAY-BLK-L","stock":9,"options":{"color":"Black","size":"L"}}]'::jsonb),

  (c_western, v_id, 'High-Waist Denim Jeans', 'Stretch-fit high-waist denim jeans with a tapered leg, all-day comfort.', 1799, NULL, 'WST-DEN-001', 45, true, 'approved',
    ARRAY['https://placehold.co/800x1000/dbe7f0/1f3a5f?text=Denim+Jeans','https://placehold.co/800x1000/dbe7f0/1f3a5f?text=Denim+Jeans+2'],
    '[{"id":"wst-den-blu-30","name":"Blue / 30","price":1799,"sku":"WST-DEN-BLU-30","stock":12,"options":{"color":"Blue","size":"30"}},{"id":"wst-den-blu-32","name":"Blue / 32","price":1799,"sku":"WST-DEN-BLU-32","stock":12,"options":{"color":"Blue","size":"32"}},{"id":"wst-den-blk-30","name":"Black / 30","price":1799,"sku":"WST-DEN-BLK-30","stock":11,"options":{"color":"Black","size":"30"}},{"id":"wst-den-blk-32","name":"Black / 32","price":1799,"sku":"WST-DEN-BLK-32","stock":10,"options":{"color":"Black","size":"32"}}]'::jsonb),

  (c_western, v_id, 'Floral Wrap Dress', 'Midi wrap dress with a floral print, a flattering fit for brunch or evening outings.', 2299, 2999, 'WST-DRS-001', 24, true, 'approved',
    ARRAY['https://placehold.co/800x1000/dbe7f0/1f3a5f?text=Wrap+Dress','https://placehold.co/800x1000/dbe7f0/1f3a5f?text=Wrap+Dress+2'],
    '[{"id":"wst-drs-s","name":"Floral / S","price":2299,"sku":"WST-DRS-S","stock":8,"options":{"color":"Floral Print","size":"S"}},{"id":"wst-drs-m","name":"Floral / M","price":2299,"sku":"WST-DRS-M","stock":8,"options":{"color":"Floral Print","size":"M"}},{"id":"wst-drs-l","name":"Floral / L","price":2299,"sku":"WST-DRS-L","stock":8,"options":{"color":"Floral Print","size":"L"}}]'::jsonb),

  (c_western, v_id, 'Casual Cotton Shirt', 'Relaxed-fit cotton shirt, easy to dress up or down for everyday wear.', 1099, NULL, 'WST-SHT-001', 50, true, 'approved',
    ARRAY['https://placehold.co/800x1000/dbe7f0/1f3a5f?text=Cotton+Shirt','https://placehold.co/800x1000/dbe7f0/1f3a5f?text=Cotton+Shirt+2'],
    '[{"id":"wst-sht-wht-s","name":"White / S","price":1099,"sku":"WST-SHT-WHT-S","stock":13,"options":{"color":"White","size":"S"}},{"id":"wst-sht-wht-m","name":"White / M","price":1099,"sku":"WST-SHT-WHT-M","stock":13,"options":{"color":"White","size":"M"}},{"id":"wst-sht-sky-l","name":"Sky Blue / L","price":1099,"sku":"WST-SHT-SKY-L","stock":12,"options":{"color":"Sky Blue","size":"L"}},{"id":"wst-sht-sky-xl","name":"Sky Blue / XL","price":1099,"sku":"WST-SHT-SKY-XL","stock":12,"options":{"color":"Sky Blue","size":"XL"}}]'::jsonb);
END $$;
