-- The warehouse's quality check takes up to 3 working days, not 1 (testing
-- checklist v1.2, Nov 2026: "Quality check done within 3 working days").
-- warehouse_handling_days drives both the delivery dates shoppers see
-- (shiprocket-estimate-delivery: "Ships by" / "Delivery by") and the
-- warehouse's own "dispatch by" date (warehouse_dispatch_by). Admins can
-- still change it in Warehouse > Settings > Rules.
ALTER TABLE public.platform_settings ALTER COLUMN warehouse_handling_days SET DEFAULT 3;
UPDATE public.platform_settings SET warehouse_handling_days = 3 WHERE id;
