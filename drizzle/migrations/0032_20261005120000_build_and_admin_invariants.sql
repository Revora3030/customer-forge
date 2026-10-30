-- Database-enforced invariants for first builds and platform administration.
--
-- 1. One active build per workspace.
--    runSiteGeneration checked for a queued/processing job and then inserted a
--    new one. Two requests arriving together (double click, retry, two tabs)
--    could both pass the check and queue two first builds that write the same
--    pages. A partial unique index makes the database the single source of
--    truth: at most one generation_jobs row per organization may be in
--    'queued' or 'processing'. The application treats the resulting unique
--    violation (23505) as "a build is already running" and returns that job.
--
--    Existing duplicates (if any) are resolved first, newest-active wins; the
--    older duplicates are marked failed with a clear message, exactly like the
--    existing stale-job cleanup. No row is deleted.
--
-- 2. super_admin may only ever belong to revorabusiness0@gmail.com.
--    guard_platform_role_writes already blocks every non-service caller. This
--    adds a check that also binds the service role and database owner: the
--    role can only be held by the account whose auth email is the platform
--    owner's. It does not grant or revoke anything for existing rows.

-- 1a. Resolve any pre-existing duplicate active jobs (keeps the newest).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id
           ORDER BY (status = 'processing') DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.generation_jobs
  WHERE status IN ('queued', 'processing')
)
UPDATE public.generation_jobs AS j
SET status = 'failed',
    error_message = 'Duplicate build closed: another build for this workspace was already running.',
    completed_at = now(),
    lease_expires_at = NULL,
    updated_at = now()
FROM ranked
WHERE j.id = ranked.id
  AND ranked.rn > 1;

-- 1b. At most one active build per workspace, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_one_active_per_org
  ON public.generation_jobs (organization_id)
  WHERE status IN ('queued', 'processing');

-- 2. super_admin is bound to the platform owner's account.
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
  IF _email IS DISTINCT FROM 'revorabusiness0@gmail.com' THEN
    RAISE EXCEPTION 'super_admin can only be held by the Revora platform owner account'
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
