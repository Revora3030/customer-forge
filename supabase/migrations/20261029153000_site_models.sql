-- Owner-uploaded 3D models for the model_3d_viewer primitive (owner-approved 2026-10-29).
--
-- A private bucket for binary glTF (.glb) files. Paths are always
-- "<organization_id>/models/<uuid>.glb": workspace managers upload and delete
-- inside their own folder, members can read it, and public sites get
-- short-lived signed URLs from the server. Each model sits on the site as a
-- website_components row of kind 'model_3d' whose media_url is that path, so
-- it uses the same per-section refs, RLS and visibility as pictures.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('site-models', 'site-models', false, 26214400, ARRAY['model/gltf-binary'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

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
-- No UPDATE policy: a model is replaced by uploading a new file, never overwritten in place.
