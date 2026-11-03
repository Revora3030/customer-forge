-- Follow-up to the pre-apply review (2026-11-03) of six migrations that were
-- merged but not yet applied to the live database:
--   20261029151000_jarvis_memory_vectors, 20261030130000_preview_links_support_and_hero_video_bucket,
--   20261030140000_estimate_signatures, 20261030141000_canceled_site_grace,
--   20261031190000_builder_quality_log, 20261101020000_agent_runs.
--
-- Apply this AFTER those six. Every block is guarded by to_regclass, so it is a
-- no-op for a table that does not exist yet and a re-run changes nothing.
-- No rows are inserted, updated or deleted; no table or column is dropped.
--
-- 1) site_hosting_grace: the member-read policy queried public.memberships
--    inline. Every other workspace table goes through private.is_org_member,
--    which also admits Revora support in an open, audited support session.
-- 2) Browser roles: Supabase's default privileges give anon and authenticated
--    ALL on new public tables (including TRUNCATE, which RLS does not cover).
--    RLS already denies row access, but these tables are written only by the
--    service role, so remove the write grants too (defense in depth). Covers
--    the four new tables above plus estimate_signatures / builder_quality_log
--    (which revoked only INSERT/UPDATE/DELETE) and three already-live tables
--    from the same week (lifecycle_email_optouts, lead_delivery_watch,
--    lead_watchdog_events). Existing browser SELECT through RLS is unchanged.
-- 3) jarvis_memory_embeddings.user_id referenced auth.users, but the live
--    parent table public.jarvis_memories had that same foreign key removed
--    (drizzle 0010_jarvis_memory_routines_plain_user_ids). An embedding for a
--    memory the parent table accepts must not be rejected, or semantic recall
--    silently stays lexical. The vector row still goes away with its memory
--    (memory_id ... ON DELETE CASCADE). Only done when the parent has no
--    user foreign key, so a database built purely from these migrations keeps
--    both constraints consistent.

-- 1) site_hosting_grace member read through the shared helper.
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

-- 2) Server-written tables: browsers may read (through RLS) but never write.
--    lifecycle_email_optouts has no browser policy (service role only), so
--    authenticated keeps no SELECT on it either.
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

-- 3) Keep the embedding's user reference consistent with its parent memory.
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
