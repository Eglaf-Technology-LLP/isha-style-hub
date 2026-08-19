-- Bank/payout details for split payments (Phase 4). Kept in a separate
-- table rather than columns on `vendors`, because `vendors` has a broad
-- "Public can view approved vendors" SELECT policy for the storefront -
-- bank account numbers have no business being reachable through that.
-- Only the vendor's own members and admins can ever read this table.
CREATE TABLE public.vendor_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  bank_account_number text NOT NULL,
  bank_ifsc text NOT NULL,
  business_type text NOT NULL DEFAULT 'individual'
    CHECK (business_type IN ('individual', 'proprietorship', 'partnership', 'private_limited', 'llp')),
  razorpay_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor members can view their own payout account"
  ON public.vendor_payout_accounts FOR SELECT
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vendor members can create their own payout account"
  ON public.vendor_payout_accounts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id));

CREATE POLICY "Vendor members can update their own payout account"
  ON public.vendor_payout_accounts FOR UPDATE
  TO authenticated
  USING (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_vendor_member(auth.uid(), vendor_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vendor_payout_accounts_updated_at
  BEFORE UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
