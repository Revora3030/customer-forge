-- Jarvis routines call the AI, so a pass takes tens of seconds. The routines job
-- was scheduled without a timeout, so pg_net's short default disconnected it
-- long before the pass finished; on 10-29 a pass stopped part-way through its
-- third routine and left that routine marked "running". Every other long job
-- (prospect autopilot, site-engine backstop, prospect replies) passes an explicit
-- 900000 ms timeout through public.call_revora_job, and this does the same.
--
-- Same guards as 20261019090200_prospect_autopilot_schedule.sql: does nothing
-- where pg_cron or call_revora_job is missing (local/preview databases), and
-- re-running reschedules the job in place.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; the Jarvis routines schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; the Jarvis routines schedule was not changed.';
    RETURN;
  END IF;

  -- Every 15 minutes, as before. cron.schedule with an existing name updates that job.
  PERFORM cron.schedule(
    'revora-jarvis-routines',
    '*/15 * * * *',
    $cmd$select public.call_revora_job('jarvis-routines', 900000)$cmd$
  );
END $$;
