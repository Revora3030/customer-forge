-- PAI-6: business memory store (platform AI plan, section 2.3).
--
-- What the platform AI remembers about one business, per workspace
-- (organization). Three NEW tables, nothing existing is altered:
--   business_memory             one fact / tone rule / style preference
--   business_memory_events      change history (who, what, old, new); append-only
--   business_memory_embeddings  server-only pgvector side table for recall
--
-- Rules the database itself enforces (the server code checks them first, these
-- are the backstop):
--   * a fact needs a source (an owner-entered fact is its own source; anything
--     else needs a source_id such as a chat message id or a page URL);
--   * a model-inferred fact starts 'proposed' and is only 'confirmed' with a named
--     confirmed_by (the owner), never by the model;
--   * tone rules and style preferences are owner-entered only;
--   * delete is soft (deleted_at); the events table keeps the history.
-- RLS: workspace members read; owners/admins/managers write (private helpers
-- already used by website_memory and agent_runs); vectors are service-role only.
-- Additive and idempotent. pgvector is already enabled on the live database by
-- 20261029151000_jarvis_memory_vectors.sql; the guard below is a no-op there.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.business_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'tone_rule', 'style_preference')),
  key TEXT NOT NULL CHECK (char_length(btrim(key)) BETWEEN 1 AND 120),
  value TEXT NOT NULL CHECK (char_length(btrim(value)) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'superseded')),
  source_type TEXT NOT NULL CHECK (source_type IN ('owner_entered', 'owner_message', 'url', 'website_memory', 'agent_inference', 'system')),
  source_id TEXT CHECK (source_id IS NULL OR char_length(source_id) BETWEEN 1 AND 500),
  source_quote TEXT CHECK (source_quote IS NULL OR char_length(source_quote) <= 500),
  fetched_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES public.business_memory(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A fact needs a source: owner-entered is its own source, anything else needs a source_id.
  CONSTRAINT business_memory_fact_has_source CHECK (kind <> 'fact' OR source_type = 'owner_entered' OR source_id IS NOT NULL),
  -- A model-inferred fact is only ever confirmed by a named person (confirmed_by), never by the model.
  CONSTRAINT business_memory_inferred_needs_owner CHECK (status <> 'confirmed' OR source_type <> 'agent_inference' OR confirmed_by IS NOT NULL),
  -- Tone rules and style preferences are the owner's words.
  CONSTRAINT business_memory_style_is_owner CHECK (kind = 'fact' OR source_type IN ('owner_entered', 'owner_message')),
  CONSTRAINT business_memory_confirmed_has_time CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS business_memory_org_status_idx
  ON public.business_memory (organization_id, status, kind, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS business_memory_source_idx
  ON public.business_memory (organization_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
-- One live confirmed answer per kind and key; a new answer supersedes the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS business_memory_confirmed_key_uidx
  ON public.business_memory (organization_id, kind, lower(btrim(key)))
  WHERE status = 'confirmed' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.business_memory_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  memory_id UUID NOT NULL REFERENCES public.business_memory(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('proposed', 'confirmed', 'edited', 'superseded', 'deleted', 'restored')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('owner', 'agent', 'system')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_memory_events_memory_idx
  ON public.business_memory_events (memory_id, id);
CREATE INDEX IF NOT EXISTS business_memory_events_org_idx
  ON public.business_memory_events (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.business_memory_embeddings (
  memory_id UUID PRIMARY KEY REFERENCES public.business_memory(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 3 AND 80),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  embedding extensions.vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_memory_embeddings_org_idx
  ON public.business_memory_embeddings (organization_id);
CREATE INDEX IF NOT EXISTS business_memory_embeddings_hnsw_idx
  ON public.business_memory_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.business_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memory_embeddings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_memory, public.business_memory_events, public.business_memory_embeddings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.business_memory TO authenticated;      -- no DELETE: removal is soft
GRANT SELECT, INSERT ON TABLE public.business_memory_events TO authenticated;       -- append-only
GRANT ALL ON TABLE public.business_memory, public.business_memory_events, public.business_memory_embeddings TO service_role;
-- No browser access to vectors.

DROP POLICY IF EXISTS business_memory_member_read ON public.business_memory;
CREATE POLICY business_memory_member_read ON public.business_memory
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS business_memory_manager_insert ON public.business_memory;
CREATE POLICY business_memory_manager_insert ON public.business_memory
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_org(organization_id));
DROP POLICY IF EXISTS business_memory_manager_update ON public.business_memory;
CREATE POLICY business_memory_manager_update ON public.business_memory
  FOR UPDATE TO authenticated USING (private.can_manage_org(organization_id)) WITH CHECK (private.can_manage_org(organization_id));

DROP POLICY IF EXISTS business_memory_events_member_read ON public.business_memory_events;
CREATE POLICY business_memory_events_member_read ON public.business_memory_events
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS business_memory_events_manager_insert ON public.business_memory_events;
CREATE POLICY business_memory_events_manager_insert ON public.business_memory_events
  FOR INSERT TO authenticated WITH CHECK (private.can_manage_org(organization_id));

-- Vectors are server-only: the one policy is for the service role.
DROP POLICY IF EXISTS business_memory_embeddings_service_role ON public.business_memory_embeddings;
CREATE POLICY business_memory_embeddings_service_role ON public.business_memory_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.business_memory IS
  'What the platform AI remembers about one business. Facts need a source; model-inferred facts stay proposed; delete is soft.';
COMMENT ON TABLE public.business_memory_events IS 'Append-only change history for business_memory (old/new/by).';
COMMENT ON TABLE public.business_memory_embeddings IS 'Server-only pgvector side table for business_memory recall.';

-- Top-k recall for one workspace. Only live (not deleted, not superseded) rows match,
-- and the workspace is a parameter the server fills from the session.
CREATE OR REPLACE FUNCTION public.match_business_memory(p_org_id UUID, p_query extensions.vector(1536), p_limit INT DEFAULT 8)
RETURNS TABLE (memory_id UUID, similarity DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT e.memory_id, 1 - (e.embedding <=> p_query) AS similarity
  FROM public.business_memory_embeddings e
  JOIN public.business_memory m ON m.id = e.memory_id AND m.organization_id = e.organization_id
  WHERE e.organization_id = p_org_id
    AND m.organization_id = p_org_id
    AND m.deleted_at IS NULL
    AND m.status IN ('proposed', 'confirmed')
  ORDER BY e.embedding <=> p_query
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.match_business_memory(UUID, extensions.vector, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_business_memory(UUID, extensions.vector, INT) TO service_role;

COMMIT;
