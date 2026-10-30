ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS capacity_deferrals integer NOT NULL DEFAULT 0;