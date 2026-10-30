-- Harden SECURITY DEFINER trigger helpers.
--
-- These functions are invoked by database triggers and are not application RPCs.
-- Their privileged execution path must not be directly callable by browser roles.
-- SECURITY DEFINER keeps trigger execution working because the function owner
-- executes the body with the required privileges.
--
-- Keep public-facing helpers such as private.org_site_published(uuid) unchanged:
-- those are intentionally called from RLS policies for anon/authenticated.

REVOKE ALL ON FUNCTION private.protect_org_billing_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.production_unlocked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_production_activation() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.default_org_billing_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.freeze_organization_id() FROM PUBLIC;
