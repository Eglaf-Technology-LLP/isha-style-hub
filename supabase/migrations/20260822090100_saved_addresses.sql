-- Finishes a feature that was already fully built in the frontend
-- (src/hooks/useSavedAddresses.ts, src/components/account/AddressSection.tsx,
-- wired into the Addresses tab on /account) but never migrated - every call
-- there is wrapped in `(supabase as any)` because this table didn't exist,
-- and it has been erroring at runtime. Column names/types match that
-- existing SavedAddress/AddressFormData contract exactly.
CREATE TABLE public.saved_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_addresses_user_id ON public.saved_addresses(user_id);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

-- Simplest per-user pattern already used in this schema (matches wishlists).
CREATE POLICY "Users can manage their own saved addresses"
  ON public.saved_addresses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
