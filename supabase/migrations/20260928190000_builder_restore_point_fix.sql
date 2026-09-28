-- REVORA BUILDER RELIABILITY FIX #1
-- Allow staff users to create website restore points.
-- Managers retain control over updating/deleting versions.

DROP POLICY IF EXISTS "website_versions_write"
ON public.website_versions;

CREATE POLICY "website_versions_write"
ON public.website_versions
FOR INSERT
TO authenticated
WITH CHECK (
  private.org_role_at_least(organization_id, 'staff')
  OR private.is_super_admin()
);

DROP POLICY IF EXISTS "website_versions_update"
ON public.website_versions;

CREATE POLICY "website_versions_update"
ON public.website_versions
FOR UPDATE
TO authenticated
USING (
  private.org_role_at_least(organization_id, 'manager')
  OR private.is_super_admin()
)
WITH CHECK (
  private.org_role_at_least(organization_id, 'manager')
  OR private.is_super_admin()
);