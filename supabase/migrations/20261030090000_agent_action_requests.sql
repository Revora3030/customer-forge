-- Founder approval queue for outside bots (Grok) — Level 4 actions only.
--
-- A bot asks through POST /api/public/agent/action-requests (key-checked); the
-- founder approves or rejects one request at a time on /admin/approvals; the
-- bot polls the decision and, only when approved, carries out that one action
-- and reports back. The platform never performs the action from this table.
--
-- Platform-level (no organization_id): rows describe Revora's own operations.
-- Additive. Super-admins can read; every write goes through the server
-- (service role), which checks the agent key or the super-admin role.

CREATE TABLE IF NOT EXISTS public.agent_action_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN (
    'merge_pull_request', 'deploy_production', 'publish_site', 'send_outreach',
    'start_paid_build', 'change_billing', 'delete_customer_data', 'retry_failed_job'
  )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 4000),
  target_url TEXT CHECK (target_url IS NULL OR target_url ~ '^https://'),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(payload) <= 9000),
  evidence JSONB CHECK (evidence IS NULL OR pg_column_size(evidence) <= 40000),
  requested_by TEXT NOT NULL DEFAULT 'grok' CHECK (requested_by ~ '^[a-z0-9-]{2,40}$'),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{8,120}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  completed_at TIMESTAMPTZ,
  result_url TEXT CHECK (result_url IS NULL OR result_url ~ '^https://'),
  result_note TEXT CHECK (result_note IS NULL OR char_length(result_note) <= 1000),
  CONSTRAINT agent_action_requests_pkey PRIMARY KEY (id),
  CONSTRAINT agent_action_requests_idempotency_unique UNIQUE (requested_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS agent_action_requests_inbox_idx
  ON public.agent_action_requests (status, created_at DESC);

ALTER TABLE public.agent_action_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_action_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_action_requests TO authenticated;
GRANT ALL ON public.agent_action_requests TO service_role;

DROP POLICY IF EXISTS "Super admins read agent action requests" ON public.agent_action_requests;
CREATE POLICY "Super admins read agent action requests"
  ON public.agent_action_requests FOR SELECT TO authenticated
  USING (private.is_super_admin());
