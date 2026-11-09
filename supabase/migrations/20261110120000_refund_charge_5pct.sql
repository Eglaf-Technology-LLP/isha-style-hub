-- Bank refund charge is 5% (+ GST on it), not 3% - confirmed by the client
-- on 10 Nov 2026. Refunds to the AllBoutiqs wallet stay free. Admins can
-- still change it in Returns > Return settings.
ALTER TABLE public.platform_settings ALTER COLUMN refund_charge_pct SET DEFAULT 5;
UPDATE public.platform_settings SET refund_charge_pct = 5 WHERE id;
