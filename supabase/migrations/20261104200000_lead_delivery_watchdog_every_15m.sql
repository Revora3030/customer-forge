-- Reschedule the lead delivery watchdog (created by 20261101010000_lead_delivery_watchdog.sql)
-- from every 5 minutes to every 15 minutes, so the repo matches the live database.
-- The owner chose 15 minutes and it is already applied that way in production.
--
-- Idempotent and non-destructive:
--   * no DROP, no unschedule, no row changes outside cron's own job row;
--   * does nothing (NOTICE only) when pg_cron or the job is missing;
--   * cron.alter_job only changes the schedule, so re-running is a no-op.

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; lead delivery watchdog schedule was not changed.';
    RETURN;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'cron.job is missing; lead delivery watchdog schedule was not changed.';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'revora-lead-delivery-watchdog'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE NOTICE 'revora-lead-delivery-watchdog job is missing; schedule was not changed.';
    RETURN;
  END IF;

  PERFORM cron.alter_job(job_id := v_job_id, schedule := '*/15 * * * *');
END $$;
