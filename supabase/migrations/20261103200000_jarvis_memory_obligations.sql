-- Jarvis memory: obligations, half-life decay and supersession (additive).
--
-- Adds four nullable columns to public.jarvis_memories. Nothing is dropped,
-- renamed or rewritten, and existing rows keep NULL (the server then uses the
-- per-kind default half-life and treats the row as an ordinary memory).
--   due_at         - the row is an obligation Jarvis raises once due; obligations
--                    are listed by due time, never embedded or ranked by relevance.
--   completed_at   - when the obligation was met.
--   superseded_by  - a newer memory replaced this one; it no longer reaches the prompt.
--   half_life_days - this memory's own recency half-life (NULL = default for its kind).
--
-- Access is unchanged: the table is server-only (RLS enabled, no browser
-- policies, service role only) and every read is scoped to one owner's user_id.

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

-- Due, unmet obligations for one owner: WHERE user_id = $1 AND due_at <= now() AND completed_at IS NULL.
CREATE INDEX IF NOT EXISTS jarvis_memories_open_obligations_idx
  ON public.jarvis_memories (user_id, due_at)
  WHERE due_at IS NOT NULL AND completed_at IS NULL;
