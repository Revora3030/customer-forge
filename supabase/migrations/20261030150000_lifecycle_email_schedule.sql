-- Lifecycle emails (welcome, setup reminder, booking follow-up, win-back) on a
-- schedule, with a working unsubscribe.
--
-- 1. lifecycle_email_optouts: one unsubscribe token per recipient address
--    (lowercased). opted_out_at is set when the owner clicks the link; the
--    lifecycle job never emails an opted-out address again. Server-only: RLS
--    is on with no policies, so only the service role can read or write it.
-- 2. A recipient index on lifecycle_email_log so the job can check "has this
--    person already had this email" across every workspace they own.
-- 3. pg_cron schedule through public.call_revora_job, same guards as
--    20261030120000_customer_jobs_schedule.sql: does nothing where pg_cron or
--    call_revora_job is missing, and re-running reschedules in place. Until now
--    the job only ran when someone dispatched it by hand from GitHub Actions.

CREATE TABLE IF NOT EXISTS public.lifecycle_email_optouts (
  email text PRIMARY KEY CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 320),
  token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{24,80}$'),
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.lifecycle_email_optouts TO service_role;
ALTER TABLE public.lifecycle_email_optouts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lifecycle_email_log_recipient_idx
  ON public.lifecycle_email_log (lower(recipient), kind);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; lifecycle email schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; lifecycle email schedule was not changed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'revora-lifecycle-email',
    '15 * * * *',
    $cmd$select public.call_revora_job('lifecycle-email', 900000)$cmd$
  );
END $$;
