-- A build that fails because the free AI pool is at capacity (rate limits,
-- quotas, timeouts) waits and retries without spending one of its three
-- attempts. This counts those waits so a build can't wait forever.
-- Additive and idempotent.
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS capacity_deferrals integer NOT NULL DEFAULT 0;
