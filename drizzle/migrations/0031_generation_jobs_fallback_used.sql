ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.generation_jobs.fallback_used IS
  'True once a backup AI model answered a call during one of this job''s attempts (set by the worker; never reset).';