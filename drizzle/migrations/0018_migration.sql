CREATE OR REPLACE FUNCTION public.enforce_daily_build_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner rule: at most 5 full site builds per workspace in any 24 hours.
  PERFORM pg_advisory_xact_lock(hashtext('daily_build_' || NEW.organization_id::text));
  IF (SELECT count(*) FROM public.generation_jobs
      WHERE organization_id = NEW.organization_id
        AND created_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'DAILY_BUILD_LIMIT: this workspace has used its 5 builds for the last 24 hours'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_daily_build_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS generation_jobs_daily_limit ON public.generation_jobs;
CREATE TRIGGER generation_jobs_daily_limit
BEFORE INSERT ON public.generation_jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_build_limit();