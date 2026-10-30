-- lovable-cron-fallback-reviewed: existing 15-minute Jarvis routines job keeps its cadence; only adds the long-request timeout
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
  PERFORM cron.schedule(
    'revora-jarvis-routines',
    '*/15 * * * *',
    $cmd$select public.call_revora_job('jarvis-routines', 900000)$cmd$
  );
END $$;