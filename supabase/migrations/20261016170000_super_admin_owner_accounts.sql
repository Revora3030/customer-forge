-- super_admin is held by exactly the platform owner's two accounts.
--
-- 20261005120000 bound the role to revorabusiness0@gmail.com only. The owner
-- also runs the platform from godbody4040@gmail.com, which already holds the
-- role, and asked to keep both. This replaces the check so either account may
-- hold super_admin and every other account is still refused, including writes
-- made by the service role or the database owner. Existing rows are untouched.

CREATE OR REPLACE FUNCTION private.enforce_super_admin_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _email text;
BEGIN
  IF NEW.role::text <> 'super_admin' THEN
    RETURN NEW;
  END IF;
  SELECT lower(trim(u.email)) INTO _email FROM auth.users AS u WHERE u.id = NEW.user_id;
  IF _email IS NULL OR _email NOT IN ('revorabusiness0@gmail.com', 'godbody4040@gmail.com') THEN
    RAISE EXCEPTION 'super_admin can only be held by the Revora platform owner accounts'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_super_admin_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_super_admin_owner ON public.user_roles;
CREATE TRIGGER enforce_super_admin_owner
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION private.enforce_super_admin_owner();
