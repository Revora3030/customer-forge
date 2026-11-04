-- pg_cron 15-minute floor for the three jobs the repo still schedules every
-- 10 minutes:
--   * revora-site-engine-backstop (20261019090200_prospect_autopilot_schedule.sql)
--   * revora-prospect-replies     (20261019100000_prospect_gmail_replies.sql)
--   * revora-automation-runs      (20261030120000_customer_jobs_schedule.sql)
-- Guard logic borrowed from Bastion (bastion/cron-min-15m, 6f3a996).
--
-- Only a job whose CURRENT schedule runs more often than every 15 minutes is
-- changed: '* * * * *', '*/1'..'*/14', or a minute list with 5+ entries.
-- Jobs already at 15 minutes or slower (live prospect-replies runs */30) are
-- left untouched, so nothing is ever made more frequent.
--
-- Idempotent and non-destructive:
--   * no DROP, no unschedule, no row changes outside cron's own job rows;
--   * does nothing (NOTICE only) when pg_cron, cron.job, or a job is missing;
--   * cron.alter_job only changes the schedule; a re-run finds nothing to do.

DO $$
DECLARE
  v_job record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; cron schedules were not changed.';
    RETURN;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'cron.job is missing; cron schedules were not changed.';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT jobid, jobname, schedule
    FROM cron.job
    WHERE jobname = ANY (ARRAY[
        'revora-site-engine-backstop',
        'revora-prospect-replies',
        'revora-automation-runs'
      ])
      AND (
        schedule ~ '^\*\s+\*\s+\*\s+\*\s+\*$'
        OR schedule ~ '^\*/([1-9]|1[0-4])\s'
        OR schedule ~ '^\d+(,\d+){4,}\s'
      )
    ORDER BY jobid
  LOOP
    PERFORM cron.alter_job(job_id := v_job.jobid, schedule := '*/15 * * * *');
    RAISE NOTICE 'pg_cron job % rescheduled from "%" to */15', v_job.jobname, v_job.schedule;
  END LOOP;
END $$;
