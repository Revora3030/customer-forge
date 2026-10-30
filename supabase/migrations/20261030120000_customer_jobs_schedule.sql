-- Customer-facing background jobs scheduled in the database, through the same
-- public.call_revora_job path the site-engine backstop, prospect and Jarvis
-- jobs already use. Until now these ran only from GitHub Actions
-- (.github/workflows/scheduled-jobs.yml), which skips every job while the
-- REVORA_APP_URL / LOVABLE_CRON_SECRET repository secrets are unset, so:
--   * automation-runs   delayed follow-ups and review requests never went out
--                       unless the owner opened the Automations page;
--   * lead-alert-retry  a new-lead alert that failed once was never resent;
--   * site-health       live customer domains were never checked;
--   * backup            no point-in-time backups were taken.
-- Every route is safe to run twice (claims, idempotency keys, hourly keys), so
-- the GitHub schedule can stay as a second caller.
--
-- Same guards as 20261029130000_jarvis_routines_schedule.sql: does nothing where
-- pg_cron or call_revora_job is missing (local/preview databases), and
-- re-running reschedules each job in place.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; customer job schedules were not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; customer job schedules were not changed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'revora-automation-runs',
    '*/10 * * * *',
    $cmd$select public.call_revora_job('automation-runs', 900000)$cmd$
  );
  PERFORM cron.schedule(
    'revora-lead-alert-retry',
    '40 * * * *',
    $cmd$select public.call_revora_job('lead-alert-retry', 900000)$cmd$
  );
  PERFORM cron.schedule(
    'revora-site-health',
    '20 * * * *',
    $cmd$select public.call_revora_job('site-health', 900000)$cmd$
  );
  PERFORM cron.schedule(
    'revora-backup',
    '0 7 * * *',
    $cmd$select public.call_revora_job('backup', 900000)$cmd$
  );
END $$;
