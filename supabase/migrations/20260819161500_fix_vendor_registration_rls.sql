-- useVendor.ts's registerVendor() does insert(...).select().single() on
-- vendors. A freshly self-registering owner has status='pending' (not
-- covered by "Public can view approved vendors") and no vendor_members row
-- yet - that insert happens in a second step, right after this one - so
-- "Vendor members can view their vendor" doesn't cover it either. No
-- existing SELECT policy lets them read back the row they just created,
-- so every vendor registration fails with an RLS error before it even
-- reaches the vendor_members insert.
--
-- Unlike the guest-checkout case, this is a real authenticated session, so
-- the fix isn't "skip the reselect" - it's a straightforward, safe policy
-- that was simply missing: an owner can always see their own vendor row.
CREATE POLICY "Owners can view their own vendor application"
  ON public.vendors FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());
