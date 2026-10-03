-- Team role guard.
--
-- The memberships update/delete policies allowed any member with
-- can_manage_org (owner, admin AND manager) to change any row directly from
-- the browser. A manager could therefore promote themselves to owner/admin,
-- demote or remove the real owner, or leave a workspace with no owner at all.
-- These rules are now enforced in the database, regardless of the client:
--   * only owners and admins may change roles or remove teammates;
--   * nobody but an owner may grant, change or remove the owner role;
--   * an admin may not grant admin (no privilege escalation between peers);
--   * the last owner of a workspace can never be demoted or removed.
-- The service role (server-side invitations, provisioning, support tooling)
-- and platform super admins are unaffected.

CREATE OR REPLACE FUNCTION private.guard_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _org uuid := COALESCE(NEW.organization_id, OLD.organization_id);
  _actor_role public.app_role;
  _owners integer;
BEGIN
  -- Server-side code (service role) and platform admins manage freely.
  IF _actor IS NULL OR public.is_super_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT role INTO _actor_role
  FROM public.memberships
  WHERE organization_id = _org AND user_id = _actor;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
      RETURN NEW;
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'MEMBERSHIP_USER_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF _actor_role IS NULL OR _actor_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'ONLY_OWNER_OR_ADMIN_CAN_CHANGE_ROLES' USING ERRCODE = '42501';
    END IF;
    IF (OLD.role = 'owner' OR NEW.role = 'owner') AND _actor_role <> 'owner' THEN
      RAISE EXCEPTION 'ONLY_OWNER_CAN_CHANGE_OWNER_ROLE' USING ERRCODE = '42501';
    END IF;
    IF NEW.role = 'admin' AND _actor_role <> 'owner' THEN
      RAISE EXCEPTION 'ONLY_OWNER_CAN_GRANT_ADMIN' USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'admin' AND _actor_role <> 'owner' AND OLD.user_id <> _actor THEN
      RAISE EXCEPTION 'ONLY_OWNER_CAN_CHANGE_ADMIN' USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
      SELECT count(*) INTO _owners FROM public.memberships
      WHERE organization_id = _org AND role = 'owner';
      IF _owners <= 1 THEN
        RAISE EXCEPTION 'LAST_OWNER_CANNOT_BE_DEMOTED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Anyone may leave a workspace themselves, except its last owner.
    IF OLD.user_id <> _actor THEN
      IF _actor_role IS NULL OR _actor_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'ONLY_OWNER_OR_ADMIN_CAN_REMOVE' USING ERRCODE = '42501';
      END IF;
      IF OLD.role IN ('owner', 'admin') AND _actor_role <> 'owner' THEN
        RAISE EXCEPTION 'ONLY_OWNER_CAN_REMOVE_OWNER_OR_ADMIN' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF OLD.role = 'owner' THEN
      SELECT count(*) INTO _owners FROM public.memberships
      WHERE organization_id = _org AND role = 'owner';
      IF _owners <= 1 THEN
        RAISE EXCEPTION 'LAST_OWNER_CANNOT_BE_REMOVED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Creating your own owner row for a brand-new workspace stays allowed by
    -- the insert policy. Adding anyone else directly is limited to owners and
    -- admins, and only owners can add an owner or admin.
    IF NEW.user_id <> _actor THEN
      IF _actor_role IS NULL OR _actor_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'ONLY_OWNER_OR_ADMIN_CAN_ADD_MEMBERS' USING ERRCODE = '42501';
      END IF;
      IF NEW.role IN ('owner', 'admin') AND _actor_role <> 'owner' THEN
        RAISE EXCEPTION 'ONLY_OWNER_CAN_ADD_OWNER_OR_ADMIN' USING ERRCODE = '42501';
      END IF;
    ELSIF _actor_role IS NOT NULL THEN
      -- An existing member cannot insert a second row for themselves.
      RAISE EXCEPTION 'ALREADY_A_MEMBER' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_membership_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS memberships_role_guard ON public.memberships;
CREATE TRIGGER memberships_role_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION private.guard_membership_change();
