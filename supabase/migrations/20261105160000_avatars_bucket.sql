-- LPL-8 profile-management: public avatars bucket for Settings profile photo.
-- Paths are always "<auth.uid()>/avatar.<ext>". Public so avatar_url can be a
-- stable https URL the same way Google OAuth picture URLs work in ensureProfile.
-- Prefer this over tenant-media: that bucket is org-scoped and only managers
-- may insert, so ordinary members could not change their own photo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_self_insert" ON storage.objects;
CREATE POLICY "avatars_self_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) in ('jpg','jpeg','png','webp','avif')
  );

DROP POLICY IF EXISTS "avatars_self_update" ON storage.objects;
CREATE POLICY "avatars_self_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_self_delete" ON storage.objects;
CREATE POLICY "avatars_self_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public bucket serves /object/public/avatars/... without a SELECT policy.
