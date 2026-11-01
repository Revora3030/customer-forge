-- PAI-4: server-side approvals for the AI agent (additive only: one new table,
-- indexes and functions; nothing existing is altered, dropped or renamed).
--
-- Anything an agent run wants to send OUTSIDE the business (a customer message,
-- a quote, a campaign) or that Jarvis wants to write as admin waits here for a
-- human tap. This generalises jarvis_approvals with an organization_id.
--
--   request   one approval per (workspace, tool, exact arguments): asking twice
--             while one is live returns the same row. Lives 24 hours.
--   decide    only the workspace owner (memberships.role = 'owner') can decide an
--             owner-scope approval; only a super admin an admin-scope one.
--   consume   atomic approved -> consumed, matched on workspace + tool + the
--             SHA-256 of the exact arguments, unexpired. A changed argument, an
--             expired, rejected or already-consumed approval never matches.
--
-- Rows are read by workspace members (owner scope) or super admins (admin
-- scope); every write goes through the service role and these functions.

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'owner' CHECK (scope IN ('owner', 'admin')),
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  step_id text CHECK (step_id IS NULL OR length(step_id) <= 80),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tool text NOT NULL CHECK (length(tool) BETWEEN 1 AND 80),
  args jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(args) <= 16384),
  args_hash text NOT NULL CHECK (args_hash ~ '^[0-9a-f]{64}$'),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 300),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'consumed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  consumed_at timestamptz,
  CONSTRAINT agent_approvals_scope_org CHECK (scope = 'admin' OR organization_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS agent_approvals_org_idx
  ON public.agent_approvals (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_approvals_run_idx ON public.agent_approvals (run_id) WHERE run_id IS NOT NULL;
-- At most one live approval per workspace + tool + exact arguments.
CREATE UNIQUE INDEX IF NOT EXISTS agent_approvals_live_key
  ON public.agent_approvals (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), scope, tool, args_hash
  ) WHERE status IN ('pending', 'approved');

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_approvals TO authenticated;
GRANT ALL ON public.agent_approvals TO service_role;

DROP POLICY IF EXISTS agent_approvals_read ON public.agent_approvals;
CREATE POLICY agent_approvals_read ON public.agent_approvals
  FOR SELECT TO authenticated
  USING (
    (scope = 'owner' AND public.is_org_member(organization_id))
    OR (scope = 'admin' AND public.is_super_admin())
  );

-- Ask for approval. Idempotent for the same workspace + tool + arguments.
-- Returns {created, approval}; created is false when a live one already existed.
CREATE OR REPLACE FUNCTION public.agent_approval_request(
  _org uuid, _scope text, _run uuid, _step text, _user uuid, _tool text,
  _args jsonb, _hash text, _summary text, _ttl_seconds integer DEFAULT 86400
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_approvals; made boolean := false;
BEGIN
  UPDATE public.agent_approvals SET status = 'expired'
   WHERE status IN ('pending', 'approved') AND expires_at <= now()
     AND organization_id IS NOT DISTINCT FROM _org AND scope = _scope AND tool = _tool AND args_hash = _hash;
  SELECT * INTO r FROM public.agent_approvals
   WHERE status IN ('pending', 'approved')
     AND organization_id IS NOT DISTINCT FROM _org AND scope = _scope AND tool = _tool AND args_hash = _hash;
  IF FOUND THEN RETURN jsonb_build_object('created', false, 'approval', to_jsonb(r)); END IF;
  BEGIN
    INSERT INTO public.agent_approvals
      (organization_id, scope, run_id, step_id, requested_by, tool, args, args_hash, summary, expires_at)
    VALUES
      (_org, _scope, _run, left(_step, 80), _user, _tool, coalesce(_args, '{}'::jsonb), _hash,
       left(coalesce(_summary, ''), 300), now() + make_interval(secs => least(86400, greatest(60, _ttl_seconds))))
    RETURNING * INTO r;
    made := true;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO r FROM public.agent_approvals
     WHERE status IN ('pending', 'approved')
       AND organization_id IS NOT DISTINCT FROM _org AND scope = _scope AND tool = _tool AND args_hash = _hash;
  END;
  RETURN jsonb_build_object('created', made, 'approval', to_jsonb(r));
END $$;

-- Approve or reject. The role check lives here so no caller can skip it.
-- outcome: approved | rejected | forbidden | expired | already_decided | not_found
CREATE OR REPLACE FUNCTION public.agent_approval_decide(_id uuid, _decider uuid, _approve boolean)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_approvals; allowed boolean;
BEGIN
  SELECT * INTO r FROM public.agent_approvals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF r.scope = 'owner' THEN
    allowed := EXISTS (SELECT 1 FROM public.memberships m
                        WHERE m.organization_id = r.organization_id AND m.user_id = _decider AND m.role = 'owner');
  ELSE
    allowed := EXISTS (SELECT 1 FROM public.user_roles u WHERE u.user_id = _decider AND u.role = 'super_admin');
  END IF;
  IF NOT allowed THEN RETURN jsonb_build_object('outcome', 'forbidden'); END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome', CASE WHEN r.status = 'expired' THEN 'expired' ELSE 'already_decided' END, 'approval', to_jsonb(r));
  END IF;
  IF r.expires_at <= now() THEN
    UPDATE public.agent_approvals SET status = 'expired' WHERE id = _id RETURNING * INTO r;
    RETURN jsonb_build_object('outcome', 'expired', 'approval', to_jsonb(r));
  END IF;
  UPDATE public.agent_approvals
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by = _decider, decided_at = now()
   WHERE id = _id RETURNING * INTO r;
  RETURN jsonb_build_object('outcome', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, 'approval', to_jsonb(r));
END $$;

-- Use an approval exactly once. Matches workspace + scope + tool + argument hash
-- (and the id when given). outcome: consumed | not_found | not_approved | rejected |
-- expired | used | changed
CREATE OR REPLACE FUNCTION public.agent_approval_consume(
  _org uuid, _scope text, _tool text, _hash text, _id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_approvals; target uuid;
BEGIN
  SELECT id INTO target FROM public.agent_approvals
   WHERE status = 'approved' AND expires_at > now()
     AND organization_id IS NOT DISTINCT FROM _org AND scope = _scope AND tool = _tool AND args_hash = _hash
     AND (_id IS NULL OR id = _id)
   ORDER BY decided_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF FOUND THEN
    UPDATE public.agent_approvals SET status = 'consumed', consumed_at = now() WHERE id = target RETURNING * INTO r;
    RETURN jsonb_build_object('outcome', 'consumed', 'approval', to_jsonb(r));
  END IF;
  -- Say why not (for the owner's feed). Other workspaces' rows are never read.
  IF _id IS NOT NULL THEN
    SELECT * INTO r FROM public.agent_approvals
     WHERE id = _id AND organization_id IS NOT DISTINCT FROM _org AND scope = _scope;
  ELSE
    SELECT * INTO r FROM public.agent_approvals
     WHERE organization_id IS NOT DISTINCT FROM _org AND scope = _scope AND tool = _tool AND args_hash = _hash
     ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF r.tool <> _tool OR r.args_hash <> _hash THEN RETURN jsonb_build_object('outcome', 'changed'); END IF;
  RETURN jsonb_build_object('outcome',
    CASE WHEN r.status = 'consumed' THEN 'used'
         WHEN r.status = 'rejected' THEN 'rejected'
         WHEN r.status = 'pending' AND r.expires_at > now() THEN 'not_approved'
         ELSE 'expired' END);
END $$;

-- Cancel what a cancelled or failed run left waiting, and expire the stale.
CREATE OR REPLACE FUNCTION public.agent_approval_cancel_for_run(_run uuid) RETURNS integer
LANGUAGE sql SET search_path = public AS $$
  WITH c AS (
    UPDATE public.agent_approvals SET status = 'cancelled'
     WHERE run_id = _run AND status IN ('pending', 'approved') RETURNING 1)
  SELECT count(*)::integer FROM c;
$$;

CREATE OR REPLACE FUNCTION public.agent_approval_sweep() RETURNS integer
LANGUAGE sql SET search_path = public AS $$
  WITH e AS (
    UPDATE public.agent_approvals SET status = 'expired'
     WHERE status IN ('pending', 'approved') AND expires_at <= now() RETURNING 1)
  SELECT count(*)::integer FROM e;
$$;

REVOKE ALL ON FUNCTION public.agent_approval_request(uuid, text, uuid, text, uuid, text, jsonb, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_approval_decide(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_approval_consume(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_approval_cancel_for_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_approval_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_approval_request(uuid, text, uuid, text, uuid, text, jsonb, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_approval_decide(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_approval_consume(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_approval_cancel_for_run(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_approval_sweep() TO service_role;
