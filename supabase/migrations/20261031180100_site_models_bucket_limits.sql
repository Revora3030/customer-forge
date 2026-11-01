-- Re-assert the upload limits on the private 3D model bucket so they hold no
-- matter how the bucket was first created or what was applied to it by hand.
--
-- * Only binary glTF (.glb) files are accepted. Plain .gltf (JSON) files are
--   deliberately refused: they point at separate texture/buffer files that a
--   private single-file bucket cannot serve, so the viewer could not load them.
-- * Hard size limit of 25 MB (26214400 bytes), matching MAX_MODEL_BYTES.
-- * The bucket stays private; the insert policy keeps requiring a .glb name.
--
-- Idempotent. Takes effect when the migration is applied on publish.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('site-models', 'site-models', false, 26214400, ARRAY['model/gltf-binary'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 26214400,
      allowed_mime_types = ARRAY['model/gltf-binary'];

DROP POLICY IF EXISTS "site_models_manager_insert" ON storage.objects;
CREATE POLICY "site_models_manager_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-models'
    AND (storage.foldername(name))[2] = 'models'
    AND lower(storage.extension(name)) = 'glb'
    AND private.can_manage_org(((storage.foldername(name))[1])::uuid)
  );
