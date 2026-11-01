-- PAI-19: self-QA job queue (additive only: a new table, a private bucket and
-- functions; nothing existing is altered, dropped or renamed).
--
-- A qa_jobs row asks a GitHub Actions runner to open one PUBLISHED public page
-- at phone (390x844) and desktop (1440x900) size and send screenshots back. The
-- repo is public, so the runner never prints owner data and never uploads
-- workflow artifacts: screenshots go to the private `qa-screenshots` bucket
-- through the app's own cron-authenticated route.
--
-- Owners (workspace members) can read their own jobs. Every write goes through
-- the service role and the functions below, with the same claim + fence + lease
-- pattern as generation_jobs and agent_runs.

CREATE TABLE IF NOT EXISTS public.qa_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  url text NOT NULL CHECK (length(url) BETWEEN 10 AND 2000 AND url ~* '^https://'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  fence integer NOT NULL DEFAULT 0,
  worker text,
  lease_expires_at timestamptz,
  not_before timestamptz NOT NULL DEFAULT now(),
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_plain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS qa_jobs_org_created_idx ON public.qa_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qa_jobs_queue_idx ON public.qa_jobs (not_before, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS qa_jobs_lease_idx ON public.qa_jobs (lease_expires_at) WHERE status = 'processing';

ALTER TABLE public.qa_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.qa_jobs TO authenticated;
GRANT ALL ON public.qa_jobs TO service_role;

DROP POLICY IF EXISTS qa_jobs_member_read ON public.qa_jobs;
CREATE POLICY qa_jobs_member_read ON public.qa_jobs
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));

-- Private bucket for the screenshots. No storage policies: only the service
-- role (the app's route) writes, and reads use short signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qa-screenshots', 'qa-screenshots', false, 2097152, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png'];

-- Queue a job. At most 3 active (queued or processing) jobs per workspace.
CREATE OR REPLACE FUNCTION public.qa_job_create(_org uuid, _url text, _run uuid DEFAULT NULL)
RETURNS public.qa_jobs LANGUAGE plpgsql SET search_path = public AS $$
DECLARE j public.qa_jobs;
BEGIN
  IF (SELECT count(*) FROM public.qa_jobs WHERE organization_id = _org AND status IN ('queued', 'processing')) >= 3 THEN
    RAISE EXCEPTION 'too many active QA jobs for this workspace' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.qa_jobs (organization_id, url, run_id) VALUES (_org, left(btrim(_url), 2000), _run)
  RETURNING * INTO j;
  RETURN j;
END $$;

-- Claim up to _max due jobs. Concurrent runners skip rows another holds.
CREATE OR REPLACE FUNCTION public.qa_job_claim(_worker text, _max integer DEFAULT 3, _lease_seconds integer DEFAULT 600)
RETURNS SETOF public.qa_jobs LANGUAGE plpgsql SET search_path = public AS $$
DECLARE j public.qa_jobs; n integer := 0;
BEGIN
  FOR j IN
    SELECT * FROM public.qa_jobs
     WHERE status = 'queued' AND not_before <= now()
     ORDER BY created_at LIMIT least(10, greatest(1, _max)) FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.qa_jobs
       SET status = 'processing', worker = left(_worker, 80), fence = fence + 1, attempts = attempts + 1,
           lease_expires_at = now() + make_interval(secs => greatest(30, _lease_seconds)),
           started_at = coalesce(started_at, now()), updated_at = now()
     WHERE id = j.id RETURNING * INTO j;
    RETURN NEXT j;
  END LOOP;
  RETURN;
END $$;

-- Finish a claimed job. False means the fence is stale (another worker owns it).
-- A failed attempt is retried (status 'queued' with backoff) until max_attempts.
CREATE OR REPLACE FUNCTION public.qa_job_finish(
  _job uuid, _fence integer, _ok boolean, _screenshots jsonb DEFAULT '[]'::jsonb,
  _metrics jsonb DEFAULT '{}'::jsonb, _error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE j public.qa_jobs;
BEGIN
  UPDATE public.qa_jobs
     SET status = CASE WHEN _ok THEN 'done' WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
         screenshots = CASE WHEN _ok THEN coalesce(_screenshots, '[]'::jsonb) ELSE screenshots END,
         metrics = coalesce(_metrics, '{}'::jsonb),
         error_plain = CASE WHEN _ok THEN NULL ELSE left(_error, 1000) END,
         not_before = CASE WHEN NOT _ok AND attempts < max_attempts THEN now() + make_interval(secs => 60 * attempts) ELSE not_before END,
         lease_expires_at = NULL, worker = NULL, updated_at = now(),
         finished_at = CASE WHEN _ok OR attempts >= max_attempts THEN now() ELSE NULL END
   WHERE id = _job AND fence = _fence AND status = 'processing'
   RETURNING * INTO j;
  RETURN FOUND;
END $$;

-- Jobs whose runner vanished: back to the queue (or failed after max attempts).
CREATE OR REPLACE FUNCTION public.qa_job_recover_stalled(_grace_seconds integer DEFAULT 60)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH s AS (
    UPDATE public.qa_jobs
       SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
           error_plain = 'The page check did not finish in time.',
           lease_expires_at = NULL, worker = NULL, updated_at = now(), fence = fence + 1,
           finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
     WHERE status = 'processing' AND lease_expires_at < now() - make_interval(secs => _grace_seconds)
     RETURNING 1)
  SELECT count(*) INTO n FROM s;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION
  public.qa_job_create(uuid, text, uuid),
  public.qa_job_claim(text, integer, integer),
  public.qa_job_finish(uuid, integer, boolean, jsonb, jsonb, text),
  public.qa_job_recover_stalled(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.qa_job_create(uuid, text, uuid),
  public.qa_job_claim(text, integer, integer),
  public.qa_job_finish(uuid, integer, boolean, jsonb, jsonb, text),
  public.qa_job_recover_stalled(integer)
TO service_role;
