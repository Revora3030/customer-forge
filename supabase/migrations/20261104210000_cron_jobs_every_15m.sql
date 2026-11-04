-- Reschedule the three pg_cron jobs that run every 10 minutes to every 15
-- minutes, so the repo matches the live database:
--   * revora-site-engine-backstop (20261019090200_prospect_autopilot_schedule.sql)
--   * revora-prospect-replies     (20261019100000_prospect_gmail_replies.sql)
--   * revora-automation-runs      (20261030120000_customer_jobs_schedule.sql)
--
-- Idempotent and non-destructive:
--   * no DROP, no unschedule, no row changes outside cron's own job rows;
--   * does nothing (NOTICE only) when pg_cron, cron.job, or a job is missing;
--   * cron.alter_job only changes the schedule, so re-running is a no-op.

DO $$
DECLARE
  v_job_name text;
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; cron schedules were not changed.';
    RETURN;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'cron.job is missing; cron schedules were not changed.';
    RETURN;
  END IF;

  FOREACH v_job_name IN ARRAY ARRAY[
    'revora-site-engine-backstop',
    'revora-prospect-replies',
    'revora-automation-runs'
  ] LOOP
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = v_job_name
    ORDER BY jobid
    LIMIT 1;

    IF v_job_id IS NULL THEN
      RAISE NOTICE '% job is missing; its schedule was not changed.', v_job_name;
      CONTINUE;
    END IF;

    PERFORM cron.alter_job(job_id := v_job_id, schedule := '*/15 * * * *');
  END LOOP;
END $$;
