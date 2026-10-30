-- lovable-cron-fallback-reviewed: owner asked to apply; Gmail replies have no push hook here, poll every 10 minutes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; prospect replies schedule not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; schedules not changed.';
    RETURN;
  END IF;
  PERFORM cron.schedule(
    'revora-prospect-replies',
    '*/10 * * * *',
    $cmd$select public.call_revora_job('prospect-replies', 900000)$cmd$
  );
END $$;