-- Single-flight leases for scheduled jobs that must never run twice at once.
--
-- The lead-delivery watchdog is called every 15 minutes by pg_cron
-- (call_revora_job) and hourly by the GitHub Actions backstop
-- (.github/workflows/scheduled-jobs.yml). Two overlapping passes could both
-- retry the same lead and double-count attempts. claim_job_lease takes a named
-- lease with one atomic INSERT ... ON CONFLICT DO UPDATE that only matches
-- while the lease is free or expired, and returns true when it did. A run
-- clears its own lease when it finishes; a run that dies frees it when
-- leased_until passes. Same shape as claim_prospect_reply_poll
-- (20261020120100), but keyed by job name so other jobs can reuse it.
--
-- Not tenant data (one row per job name, no organization_id), so the rule is
-- service-role only, matching 20261104210000: RLS on, one explicit service-role
-- policy, browser roles revoked, explicit grants. Additive and idempotent; no DROP.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_leases (
  job TEXT PRIMARY KEY CHECK (char_length(job) BETWEEN 1 AND 80),
  lease_owner TEXT,
  leased_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'job_leases' AND policyname = 'service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON public.job_leases
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$policy$;

REVOKE ALL ON TABLE public.job_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_leases TO service_role;

CREATE OR REPLACE FUNCTION public.claim_job_lease(p_job TEXT, p_owner TEXT, p_seconds INTEGER DEFAULT 600)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH claimed AS (
    INSERT INTO public.job_leases AS l (job, lease_owner, leased_until, updated_at)
    VALUES (
      left(p_job, 80),
      left(p_owner, 120),
      now() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_seconds, 600), 3600))),
      now()
    )
    ON CONFLICT (job) DO UPDATE
      SET lease_owner = EXCLUDED.lease_owner,
          leased_until = EXCLUDED.leased_until,
          updated_at = now()
      WHERE l.leased_until IS NULL OR l.leased_until < now()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.claim_job_lease(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_job_lease(TEXT, TEXT, INTEGER) TO service_role;

COMMENT ON TABLE public.job_leases IS 'Single-flight leases for scheduled jobs (service role only). One row per job name.';
COMMENT ON FUNCTION public.claim_job_lease(TEXT, TEXT, INTEGER) IS 'Atomically claims the named job lease; true when claimed, false while another run holds an unexpired lease.';

COMMIT;
