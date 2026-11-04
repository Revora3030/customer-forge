-- Hardening follow-up (migration-verdicts Part 2, N2 / F1).
--
-- agent_routines (#553), qa_jobs (#573) and website_rules (#570) GRANT to
-- authenticated/service_role but never REVOKE the Supabase default
-- privileges, so anon keeps ALL and authenticated keeps TRUNCATE,
-- REFERENCES and TRIGGER (RLS does not cover TRUNCATE). This closes that gap,
-- the same way 20261103120000_unapplied_migrations_followup (#621) does for
-- the older tables.
--
-- Idempotent and order-independent: every table is guarded by to_regclass,
-- so if this runs before #553/#573/#570 the block is a no-op, and REVOKE/GRANT
-- are safe to re-run. No DROP, no row changes, no RLS policy changes.

DO $harden$
BEGIN
  -- agent_routines: server-written (service role). Browsers read via RLS only.
  IF to_regclass('public.agent_routines') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.agent_routines FROM PUBLIC, anon';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_routines FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.agent_routines TO authenticated';
    EXECUTE 'GRANT ALL ON public.agent_routines TO service_role';
  END IF;

  -- qa_jobs: server-written (service role). Browsers read via RLS only.
  IF to_regclass('public.qa_jobs') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.qa_jobs FROM PUBLIC, anon';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.qa_jobs FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.qa_jobs TO authenticated';
    EXECUTE 'GRANT ALL ON public.qa_jobs TO service_role';
  END IF;

  -- website_rules: managers write through RLS, so authenticated keeps
  -- SELECT/INSERT/UPDATE/DELETE and loses only TRUNCATE/REFERENCES/TRIGGER.
  IF to_regclass('public.website_rules') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.website_rules FROM PUBLIC, anon';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.website_rules FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_rules TO authenticated';
    EXECUTE 'GRANT ALL ON public.website_rules TO service_role';
  END IF;
END
$harden$;
