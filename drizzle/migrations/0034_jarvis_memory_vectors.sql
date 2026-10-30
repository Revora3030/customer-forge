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