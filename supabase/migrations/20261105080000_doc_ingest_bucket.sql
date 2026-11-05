-- B12-7: private bucket for menus and price sheets the owner uploads so Revora
-- can PROPOSE services and prices. Nothing here writes to services: the owner
-- confirms each proposal in the app first. Files live at
-- <organization_id>/<uuid>.<ext>; the server reads a file once and deletes it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doc-ingest', 'doc-ingest', false, 5242880,
  array['application/pdf','image/jpeg','image/png','image/webp','text/csv','text/plain']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "doc_ingest_manager_insert" ON storage.objects;
CREATE POLICY "doc_ingest_manager_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'doc-ingest'
    AND array_length(storage.foldername(name), 1) = 1
    AND lower(storage.extension(name)) in ('pdf','jpg','jpeg','png','webp','csv','txt')
    AND private.can_manage_org(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "doc_ingest_manager_read" ON storage.objects;
CREATE POLICY "doc_ingest_manager_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'doc-ingest'
    AND private.can_manage_org(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "doc_ingest_manager_delete" ON storage.objects;
CREATE POLICY "doc_ingest_manager_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'doc-ingest'
    AND private.can_manage_org(((storage.foldername(name))[1])::uuid)
  );
-- No UPDATE policy and no anon access: uploads are one-shot and private.
