-- Early-stage build checkpoints (brief, brand identity, wording, page plan) so an
-- interrupted build resumes without regenerating finished AI work. Additive and
-- idempotent; mirrors drizzle/migrations/0006 which was applied to the live database.
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS stage_checkpoints jsonb;
