-- PAI-21: proactive suggestions (additive only: one new table + indexes; nothing
-- existing is altered, dropped or renamed).
--
-- A daily per-workspace pass checks cheap SQL signals and writes at most 3 live
-- suggestions. Each row carries its evidence. "Do it" only asks the owner for an
-- approval (agent_approvals); nothing reaches a customer without that tap.
-- Dismissed or snoozed rows block the same signal from coming back until
-- suppressed_until (14 days for a dismiss).

CREATE TABLE IF NOT EXISTS public.agent_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  signal text NOT NULL CHECK (signal IN (
    'unanswered_leads', 'no_review_asks', 'empty_hours', 'domain_unverified', 'traffic_drop', 'stale_site'
  )),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 600),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(evidence) <= 8192),
  action_goal text NOT NULL CHECK (length(action_goal) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'accepted', 'dismissed', 'snoozed', 'resolved')),
  approval_id uuid REFERENCES public.agent_approvals(id) ON DELETE SET NULL,
  suppressed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_suggestions_org_idx
  ON public.agent_suggestions (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_suggestions_approval_idx
  ON public.agent_suggestions (approval_id) WHERE approval_id IS NOT NULL;
-- One live suggestion per workspace + signal.
CREATE UNIQUE INDEX IF NOT EXISTS agent_suggestions_live_key
  ON public.agent_suggestions (organization_id, signal) WHERE status = 'active';

ALTER TABLE public.agent_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_suggestions TO authenticated;
GRANT ALL ON public.agent_suggestions TO service_role;

CREATE POLICY agent_suggestions_read ON public.agent_suggestions
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());
