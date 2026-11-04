DO $harden$
BEGIN
  IF to_regclass('public.agent_routines') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.agent_routines FROM PUBLIC, anon';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_routines FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.agent_routines TO authenticated';
    EXECUTE 'GRANT ALL ON public.agent_routines TO service_role';
  END IF;

  IF to_regclass('public.qa_jobs') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.qa_jobs FROM PUBLIC, anon';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.qa_jobs FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.qa_jobs TO authenticated';
    EXECUTE 'GRANT ALL ON public.qa_jobs TO service_role';
  END IF;

  IF to_regclass('public.website_rules') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.website_rules FROM PUBLIC, anon';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.website_rules FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_rules TO authenticated';
    EXECUTE 'GRANT ALL ON public.website_rules TO service_role';
  END IF;
END
$harden$;