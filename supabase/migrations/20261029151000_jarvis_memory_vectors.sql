-- Semantic recall for Jarvis memory (owner-approved 2026-10-29).
--
-- One embedding per saved memory, in a side table so jarvis_memories itself is
-- unchanged. Written and read only by the server (service role). Recall ranks
-- with cosine similarity through match_jarvis_memories, scoped to one owner,
-- and still blends lexical overlap and recency; without embeddings (no key,
-- gateway error, memory saved before this) recall stays lexical.

-- Fresh-database guard: public.jarvis_memories was created on the live
-- database outside this migrations folder. Create the same shape ONLY when it
-- is absent (a database built from migrations); a no-op on the live database.
DO $guard$
BEGIN
  IF to_regclass('public.jarvis_memories') IS NULL THEN
    CREATE TABLE public.jarvis_memories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      kind text NOT NULL DEFAULT 'fact',
      source text NOT NULL DEFAULT 'user',
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.jarvis_memories ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.jarvis_memories FROM anon, authenticated;
    GRANT ALL ON public.jarvis_memories TO service_role;
  END IF;
END
$guard$;


CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.jarvis_memory_embeddings (
  memory_id UUID NOT NULL REFERENCES public.jarvis_memories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 3 AND 80),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  embedding extensions.vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jarvis_memory_embeddings_pkey PRIMARY KEY (memory_id)
);

CREATE INDEX IF NOT EXISTS jarvis_memory_embeddings_user_idx
  ON public.jarvis_memory_embeddings (user_id);
CREATE INDEX IF NOT EXISTS jarvis_memory_embeddings_hnsw_idx
  ON public.jarvis_memory_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.jarvis_memory_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jarvis_memory_embeddings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.jarvis_memory_embeddings TO service_role;
-- No browser policies: vectors are server-only.

CREATE OR REPLACE FUNCTION public.match_jarvis_memories(p_user_id UUID, p_query extensions.vector(1536), p_limit INT DEFAULT 40)
RETURNS TABLE (memory_id UUID, similarity DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT e.memory_id, 1 - (e.embedding <=> p_query) AS similarity
  FROM public.jarvis_memory_embeddings e
  WHERE e.user_id = p_user_id
  ORDER BY e.embedding <=> p_query
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.match_jarvis_memories(UUID, extensions.vector, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_jarvis_memories(UUID, extensions.vector, INT) TO service_role;
