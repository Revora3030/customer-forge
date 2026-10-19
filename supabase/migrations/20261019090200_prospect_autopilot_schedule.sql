-- Schedules for the prospect autopilot and the site-engine backstop.
--
-- public.call_revora_job(path, timeout_ms) exists only on the live database
-- (not in these migrations; types.ts records its signature). The existing
-- backstop job runs select public.call_revora_job('site-engine'), and this
-- mirrors it. Both jobs pass a 900000 ms timeout: pg_net's
-- 60 s default disconnects long requests (see the platform reliability runbook).
--
-- Guarded and idempotent: does nothing where pg_cron or call_revora_job is
-- missing (local/preview databases), and re-running reschedules in place.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; prospect autopilot and backstop schedules not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; schedules not changed.';
    RETURN;
  END IF;

  -- Hourly at minute 17. cron.schedule with an existing name updates that job.
  PERFORM cron.schedule(
    'revora-prospect-autopilot',
    '17 * * * *',
    $cmd$select public.call_revora_job('prospect-autopilot', 900000)$cmd$
  );

  -- Builds must not depend on the Jarvis page being open: run the site-engine
  -- backstop every 10 minutes instead of hourly. The worker's database lease
  -- keeps overlapping runs single-flight per job.
  PERFORM cron.schedule(
    'revora-site-engine-backstop',
    '*/10 * * * *',
    $cmd$select public.call_revora_job('site-engine', 900000)$cmd$
  );
END $$;
