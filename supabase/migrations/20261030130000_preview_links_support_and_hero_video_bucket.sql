-- 1) Preview links: Revora support (a super admin in an open, audited support
--    session) can create, read and revoke a client's preview links, exactly
--    like every other builder table (private.can_manage_org / is_org_member
--    include private.has_support_access). The old inline membership checks
--    refused support, so Publish in support mode stopped at
--    "Couldn't create a preview link." The app now also creates links through
--    a server function; these policies keep direct reads and revokes working.
DROP POLICY IF EXISTS "Members read their preview links" ON public.website_preview_links;
DROP POLICY IF EXISTS "Members create their preview links" ON public.website_preview_links;
DROP POLICY IF EXISTS "Members update their preview links" ON public.website_preview_links;
DROP POLICY IF EXISTS "Members delete their preview links" ON public.website_preview_links;

CREATE POLICY "Members read their preview links"
ON public.website_preview_links FOR SELECT TO authenticated
USING (private.is_org_member(organization_id));

CREATE POLICY "Members create their preview links"
ON public.website_preview_links FOR INSERT TO authenticated
WITH CHECK (private.can_manage_org(organization_id));

CREATE POLICY "Members update their preview links"
ON public.website_preview_links FOR UPDATE TO authenticated
USING (private.can_manage_org(organization_id))
WITH CHECK (private.can_manage_org(organization_id));

CREATE POLICY "Members delete their preview links"
ON public.website_preview_links FOR DELETE TO authenticated
USING (private.can_manage_org(organization_id));

-- 2) Home page top video: the tenant-media bucket must accept the clips the
--    builder stores (stock clips up to 20 MB, owner uploads up to 40 MB). When
--    the bucket restricts types, add the video types; when its size cap is
--    below 40 MB, raise it. A bucket with no restriction is left unrestricted.
UPDATE storage.buckets
   SET allowed_mime_types = (
         SELECT array_agg(DISTINCT t)
           FROM unnest(allowed_mime_types || ARRAY['video/mp4','video/webm','video/quicktime']) AS t
       )
 WHERE id = 'tenant-media'
   AND allowed_mime_types IS NOT NULL
   AND NOT (allowed_mime_types @> ARRAY['video/mp4','video/webm','video/quicktime']);

UPDATE storage.buckets
   SET file_size_limit = 41943040
 WHERE id = 'tenant-media'
   AND file_size_limit IS NOT NULL
   AND file_size_limit < 41943040;
