ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS resumes_at timestamptz,
  ADD COLUMN IF NOT EXISTS wait_reason text,
  ADD COLUMN IF NOT EXISTS wait_providers jsonb;
COMMENT ON COLUMN public.generation_jobs.resumes_at IS 'When a capacity-deferred build resumes; mirrors lease_expires_at set by the capacity deferral path.';
COMMENT ON COLUMN public.generation_jobs.wait_reason IS 'Owner-readable reason the build is waiting for AI capacity.';
COMMENT ON COLUMN public.generation_jobs.wait_providers IS 'Providers rate-limited/out of quota at deferral, with earliest known reset.';
CREATE INDEX IF NOT EXISTS generation_jobs_status_resumes_at_idx ON public.generation_jobs (status, resumes_at);