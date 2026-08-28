-- Shiprocket returns a real courier-promised delivery date (etd) at the
-- serviceability-check stage, already shown to the vendor in ShipNowDialog
-- before booking, but nothing has ever persisted it - discarded the moment
-- the vendor clicks to book. This is the only place it can live once a
-- shipment actually exists.
ALTER TABLE public.shipments ADD COLUMN estimated_delivery_date date;
