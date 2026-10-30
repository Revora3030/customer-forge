-- Builder progress uses the chat request id from planning through apply.
-- A first build or fresh rebuild started from the chat stores that id on its
-- job, so the worker records its stages under the same run id the chat shows.
-- Additive only: a nullable column, a guarded CHECK and a partial index. The
-- worker tolerates the column being absent (it falls back to the job id).

ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS request_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generation_jobs_request_id_check'
      AND conrelid = 'public.generation_jobs'::regclass
  ) THEN
    ALTER TABLE public.generation_jobs
      ADD CONSTRAINT generation_jobs_request_id_check
      CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{4,80}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS generation_jobs_org_request_idx
  ON public.generation_jobs (organization_id, request_id)
  WHERE request_id IS NOT NULL;
