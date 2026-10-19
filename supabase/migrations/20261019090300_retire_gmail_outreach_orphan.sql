-- Retire the orphaned Gmail outreach objects.
--
-- A Lovable session created public.prospect_outreach (a different shape),
-- public.prospect_outreach_autopilot, public.prospect_outreach_suppressions and
-- the cron job jarvis-prospect-outreach directly on the live database. Their
-- code never reached lovable-sync, and prospect_outreach collided with the
-- outreach log in 20261019090000. All three tables were empty.
--
-- Nothing is dropped: the tables (and their constraint/index names) are
-- renamed with a _gmail_orphan suffix and the cron job is paused, so this is
-- fully reversible. Applied live on 2026-10-19 before 20261019090000; every
-- step is guarded, so re-running is a no-op.
DO $$
BEGIN
  -- Only the orphan shape (it has gmail_message_id) is renamed, never the
  -- outreach log that 20261019090000 creates.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prospect_outreach' AND column_name = 'gmail_message_id'
  ) THEN
    ALTER TABLE public.prospect_outreach RENAME TO prospect_outreach_gmail_orphan;
    ALTER TABLE public.prospect_outreach_gmail_orphan RENAME CONSTRAINT prospect_outreach_pkey TO prospect_outreach_gmail_orphan_pkey;
    ALTER INDEX IF EXISTS public.prospect_outreach_organization_id_key RENAME TO prospect_outreach_gmail_orphan_org_key;
    ALTER INDEX IF EXISTS public.prospect_outreach_email_once RENAME TO prospect_outreach_gmail_orphan_email_once;
    ALTER INDEX IF EXISTS public.prospect_outreach_created RENAME TO prospect_outreach_gmail_orphan_created;
  END IF;

  IF to_regclass('public.prospect_outreach_autopilot') IS NOT NULL THEN
    ALTER TABLE public.prospect_outreach_autopilot RENAME TO prospect_outreach_autopilot_gmail_orphan;
  END IF;

  IF to_regclass('public.prospect_outreach_suppressions') IS NOT NULL THEN
    ALTER TABLE public.prospect_outreach_suppressions RENAME TO prospect_outreach_suppressions_gmail_orphan;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'jarvis-prospect-outreach';
  END IF;
END $$;
