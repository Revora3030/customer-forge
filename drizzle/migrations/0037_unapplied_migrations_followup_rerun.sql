DO $grace$
BEGIN
  IF to_regclass('public.site_hosting_grace') IS NULL THEN
    RAISE NOTICE 'public.site_hosting_grace is missing; apply 20261030141000 first.';
    RETURN;
  END IF;
  ALTER TABLE public.site_hosting_grace ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "site_hosting_grace_member_read" ON public.site_hosting_grace;
  CREATE POLICY "site_hosting_grace_member_read" ON public.site_hosting_grace
    FOR SELECT TO authenticated
    USING (private.is_org_member(organization_id));
END
$grace$;

DO $grants$
BEGIN
  IF to_regclass('public.site_hosting_grace') IS NOT NULL THEN
    REVOKE ALL ON public.site_hosting_grace FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.site_hosting_grace FROM authenticated;
    GRANT ALL ON public.site_hosting_grace TO service_role;
  END IF;
  IF to_regclass('public.agent_runs') IS NOT NULL THEN
    REVOKE ALL ON public.agent_runs FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_runs FROM authenticated;
    GRANT ALL ON public.agent_runs TO service_role;
  END IF;
  IF to_regclass('public.agent_run_steps') IS NOT NULL THEN
    REVOKE ALL ON public.agent_run_steps FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_run_steps FROM authenticated;
    GRANT ALL ON public.agent_run_steps TO service_role;
  END IF;
  IF to_regclass('public.agent_run_events') IS NOT NULL THEN
    REVOKE ALL ON public.agent_run_events FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_run_events FROM authenticated;
    GRANT ALL ON public.agent_run_events TO service_role;
  END IF;
  IF to_regclass('public.estimate_signatures') IS NOT NULL THEN
    REVOKE ALL ON public.estimate_signatures FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.estimate_signatures FROM authenticated;
    GRANT ALL ON public.estimate_signatures TO service_role;
  END IF;
  IF to_regclass('public.builder_quality_log') IS NOT NULL THEN
    REVOKE ALL ON public.builder_quality_log FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.builder_quality_log FROM authenticated;
    GRANT ALL ON public.builder_quality_log TO service_role;
  END IF;
  IF to_regclass('public.lifecycle_email_optouts') IS NOT NULL THEN
    REVOKE ALL ON public.lifecycle_email_optouts FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lifecycle_email_optouts FROM authenticated;
    REVOKE SELECT ON public.lifecycle_email_optouts FROM authenticated;
    GRANT ALL ON public.lifecycle_email_optouts TO service_role;
  END IF;
  IF to_regclass('public.lead_delivery_watch') IS NOT NULL THEN
    REVOKE ALL ON public.lead_delivery_watch FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lead_delivery_watch FROM authenticated;
    GRANT ALL ON public.lead_delivery_watch TO service_role;
  END IF;
  IF to_regclass('public.lead_watchdog_events') IS NOT NULL THEN
    REVOKE ALL ON public.lead_watchdog_events FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lead_watchdog_events FROM authenticated;
    GRANT ALL ON public.lead_watchdog_events TO service_role;
  END IF;
END
$grants$;

DO $vectors$
BEGIN
  IF to_regclass('public.jarvis_memory_embeddings') IS NULL OR to_regclass('public.jarvis_memories') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.jarvis_memories'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND a.attname = 'user_id'
  ) THEN
    ALTER TABLE public.jarvis_memory_embeddings DROP CONSTRAINT IF EXISTS jarvis_memory_embeddings_user_id_fkey;
  END IF;
END
$vectors$;