-- Follow-up to 20261105160000_avatars_bucket.sql: owner-only SELECT so
-- supabase.storage.upload(..., { upsert: true }) can overwrite an existing
-- object under the caller's folder. Public /object/public/avatars/... reads
-- still do not need this policy; this is for the authenticated Storage API
-- path used by Settings avatar upload (src/lib/account-avatar.ts).
-- Do not broaden insert/update/delete — those stay as in 20261105160000.

DROP POLICY IF EXISTS "avatars_self_select" ON storage.objects;
CREATE POLICY "avatars_self_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
