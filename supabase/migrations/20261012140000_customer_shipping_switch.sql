-- "Rs 99 shipping -> hidden (Archive / Unarchive button in admin)": one
-- switch for whether customers are charged shipping at all. Archived (the
-- default, per the AllBoutiqs brief) = no shipping charge at checkout and
-- no "free shipping above Rs 999" messages; unarchived = the boutiques'
-- flat rate / free-above rules as before.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS customer_shipping_enabled boolean NOT NULL DEFAULT false;
