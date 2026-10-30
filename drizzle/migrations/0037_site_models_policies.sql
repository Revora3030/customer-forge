DROP POLICY IF EXISTS "site_models_member_read" ON storage.objects;
CREATE POLICY "site_models_member_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'site-models'
    AND (storage.foldername(name))[2] = 'models'
    AND private.is_org_member(((storage.foldername(name))[1])::uuid)
  );
DROP POLICY IF EXISTS "site_models_manager_insert" ON storage.objects;
CREATE POLICY "site_models_manager_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-models'
    AND (storage.foldername(name))[2] = 'models'
    AND lower(storage.extension(name)) = 'glb'
    AND private.can_manage_org(((storage.foldername(name))[1])::uuid)
  );
DROP POLICY IF EXISTS "site_models_manager_delete" ON storage.objects;
CREATE POLICY "site_models_manager_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-models'
    AND (storage.foldername(name))[2] = 'models'
    AND private.can_manage_org(((storage.foldername(name))[1])::uuid)
  );