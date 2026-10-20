-- Per-section checkpoints for first builds. After every chunk of sections
-- that passes the composition validator, the accepted AI-authored designs are
-- stored on the job, so a retry, lease recovery or capacity deferral of the
-- same job only asks the AI team for the sections still missing. Entries are
-- keyed by a digest of the build's inputs and discarded when they no longer
-- match; the column is cleared when the job completes.
-- Additive, nullable and idempotent; without it builds run without checkpoints.
DO $$
BEGIN
  IF to_regclass('public.generation_jobs') IS NOT NULL THEN
    ALTER TABLE public.generation_jobs
      ADD COLUMN IF NOT EXISTS section_checkpoints jsonb;
    COMMENT ON COLUMN public.generation_jobs.section_checkpoints IS
      'First-build section checkpoint: validator-accepted AI section designs keyed by input digest. Cleared on completion.';
  END IF;
END
$$;
