-- Customers could never upload their own avatar. ProfileSection.tsx has
-- always written to `${user.id}/avatar.ext` in the category-images bucket,
-- but the only write policies on this bucket were admin (anywhere) and
-- vendor members (vendor-uploads/ prefix only) - confirmed via
-- pg_policies, not assumed. No policy permitted a plain authenticated
-- user to write anywhere at all, so this failed for every non-admin,
-- non-vendor account, not an edge case.
--
-- Scoped narrowly: a user can only write under a top-level folder that
-- exactly matches their own auth.uid() - the same
-- (storage.foldername(name))[1] = '<prefix>' pattern already used for
-- vendor-uploads/, just keyed by identity instead of a fixed word.
CREATE POLICY "Users upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'category-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
