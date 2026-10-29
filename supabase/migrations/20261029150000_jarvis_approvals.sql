-- Durable, single-use approvals for Jarvis proposals (owner-approved 2026-10-29).
--
-- Every proposal in a saved Jarvis reply gets one row, keyed by the reply's
-- message id and the proposal's position ("<message id>:<index>"), with a hash
-- of exactly what Jarvis proposed. Approving claims the row atomically
-- (pending -> claimed) only when it is unexpired, unclaimed and the arguments
-- still hash to what Jarvis proposed, so a proposal runs at most once and only
-- as proposed, on any device. The rows also feed the unified approvals list.
--
-- Additive. The owner can read their own rows; every write goes through the
-- server (service role).

CREATE TABLE IF NOT EXISTS public.jarvis_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.jarvis_messages(id) ON DELETE SET NULL,
  conversation_id UUID,
  approval_key TEXT NOT NULL CHECK (char_length(approval_key) BETWEEN 3 AND 80),
  action_id TEXT NOT NULL CHECK (char_length(action_id) BETWEEN 1 AND 60),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 300),
  args_hash TEXT NOT NULL CHECK (args_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result_url TEXT CHECK (result_url IS NULL OR result_url ~ '^https://'),
  CONSTRAINT jarvis_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT jarvis_approvals_key_unique UNIQUE (user_id, approval_key)
);

CREATE INDEX IF NOT EXISTS jarvis_approvals_inbox_idx
  ON public.jarvis_approvals (user_id, status, created_at DESC);

ALTER TABLE public.jarvis_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jarvis_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jarvis_approvals TO authenticated;
GRANT ALL ON public.jarvis_approvals TO service_role;

DROP POLICY IF EXISTS "Owners read their own Jarvis approvals" ON public.jarvis_approvals;
CREATE POLICY "Owners read their own Jarvis approvals"
  ON public.jarvis_approvals FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND private.is_super_admin());
