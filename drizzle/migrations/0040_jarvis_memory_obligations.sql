ALTER TABLE public.jarvis_memories
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.jarvis_memories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS half_life_days real;

DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jarvis_memories_half_life_days_check') THEN
    ALTER TABLE public.jarvis_memories
      ADD CONSTRAINT jarvis_memories_half_life_days_check
      CHECK (half_life_days IS NULL OR (half_life_days > 0 AND half_life_days <= 3650));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jarvis_memories_not_self_superseded') THEN
    ALTER TABLE public.jarvis_memories
      ADD CONSTRAINT jarvis_memories_not_self_superseded
      CHECK (superseded_by IS NULL OR superseded_by <> id);
  END IF;
END
$checks$;

CREATE INDEX IF NOT EXISTS jarvis_memories_open_obligations_idx
  ON public.jarvis_memories (user_id, due_at)
  WHERE due_at IS NOT NULL AND completed_at IS NULL;