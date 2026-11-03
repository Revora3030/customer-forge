-- Monthly value (ROI) report on the 1st of each month.
--
-- /api/public/jobs/monthly-report emails each active workspace last month's
-- leads, booked work, appointments, site activity and Revora cost, counted
-- from its own records. Each send claims a row in lifecycle_email_log
-- (kind 'monthly_value', window_key 'YYYY-MM'; the existing
-- UNIQUE (organization_id, kind, window_key) makes a repeat run a no-op) and
-- honours lifecycle_email_optouts. No new table, column or policy: both
-- tables already exist with RLS (members read their own workspace's log via
-- private.is_org_member; opt-outs are service-role only).
--
-- 1. Grants restated explicitly for the two tables the job writes.
-- 2. pg_cron schedule through public.call_revora_job at 14:00 UTC on the 1st
--    (9-10am New York), same guards as 20261030150000_lifecycle_email_schedule.sql:
--    does nothing where pg_cron or call_revora_job is missing, and re-running
--    reschedules in place.

GRANT SELECT ON public.lifecycle_email_log TO authenticated;
GRANT ALL ON public.lifecycle_email_log TO service_role;
GRANT ALL ON public.lifecycle_email_optouts TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; monthly report schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; monthly report schedule was not changed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'revora-monthly-report',
    '0 14 1 * *',
    $cmd$select public.call_revora_job('monthly-report', 900000)$cmd$
  );
END $$;
