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