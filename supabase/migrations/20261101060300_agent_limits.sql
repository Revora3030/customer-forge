-- PAI-5: per-workspace limits, kill switch and run admission ledger for the
-- platform AI (additive only: new tables, indexes and functions; nothing
-- existing is altered, dropped or renamed. No billing, Stripe or pricing data.)
--
-- agent_settings          one optional row per workspace; enabled = false is the
--                         workspace kill switch (no new runs, queued runs cancelled).
-- agent_limits            optional per-workspace overrides. A NULL column means
--                         "use the default" that lives in src/lib/agent/limits.server.ts.
-- agent_run_admissions    admission ledger owned by PAI-5. One row per run that
--                         was let in, so "11th run in an hour" and "too many at
--                         once" are decided atomically in Postgres. It does NOT
--                         replace agent_runs (PAI-2): once agent_runs is merged the
--                         counting can switch to it behind the RunLedger interface.
--
-- Members of a workspace may READ their own rows. Every write goes through the
-- service role and the functions below, so a browser can never change a limit,
-- turn the kill switch off, or edit the ledger.

CREATE TABLE IF NOT EXISTS public.agent_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  disabled_reason text CHECK (disabled_reason IS NULL OR length(disabled_reason) <= 500),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_limits (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  max_concurrent_runs integer CHECK (max_concurrent_runs IS NULL OR max_concurrent_runs BETWEEN 1 AND 50),
  max_runs_per_hour integer CHECK (max_runs_per_hour IS NULL OR max_runs_per_hour BETWEEN 1 AND 500),
  max_tool_calls_per_minute integer CHECK (max_tool_calls_per_minute IS NULL OR max_tool_calls_per_minute BETWEEN 1 AND 600),
  -- Per-run spend ceiling in Luna microcents ($1 = 100,000,000).
  run_budget_microcents bigint CHECK (run_budget_microcents IS NULL OR run_budget_microcents BETWEEN 1 AND 10000000000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_run_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'finished', 'cancelled')),
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_run_admissions_org_created_idx
  ON public.agent_run_admissions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_run_admissions_inflight_idx
  ON public.agent_run_admissions (organization_id) WHERE status IN ('queued', 'running');

ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_admissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_settings, public.agent_limits, public.agent_run_admissions FROM anon, authenticated;
GRANT SELECT ON public.agent_settings, public.agent_limits, public.agent_run_admissions TO authenticated;
GRANT ALL ON public.agent_settings, public.agent_limits, public.agent_run_admissions TO service_role;

DROP POLICY IF EXISTS agent_settings_member_read ON public.agent_settings;
CREATE POLICY agent_settings_member_read ON public.agent_settings
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS agent_limits_member_read ON public.agent_limits;
CREATE POLICY agent_limits_member_read ON public.agent_limits
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS agent_run_admissions_member_read ON public.agent_run_admissions;
CREATE POLICY agent_run_admissions_member_read ON public.agent_run_admissions
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));

-- Decide, atomically per workspace, whether one more run may start. A workspace
-- advisory lock makes two simultaneous requests see each other, so the 11th run
-- of an hour is refused even when ten arrive at once.
-- reason: 'ok' | 'workspace_disabled' | 'too_many_running' | 'hourly_limit'
CREATE OR REPLACE FUNCTION public.agent_limits_admit_run(
  _organization_id uuid,
  _run_id uuid,
  _max_concurrent integer,
  _max_per_hour integer
) RETURNS TABLE (admitted boolean, reason text, in_flight integer, runs_last_hour integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled boolean;
  v_in_flight integer;
  v_hour integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agent_limits:' || _organization_id::text, 0));

  -- Idempotent: the same run id is never admitted (or counted) twice.
  IF EXISTS (SELECT 1 FROM public.agent_run_admissions WHERE run_id = _run_id) THEN
    SELECT count(*)::integer INTO v_in_flight FROM public.agent_run_admissions
      WHERE organization_id = _organization_id AND status IN ('queued', 'running');
    SELECT count(*)::integer INTO v_hour FROM public.agent_run_admissions
      WHERE organization_id = _organization_id AND created_at > now() - interval '1 hour'
        AND NOT (status = 'cancelled' AND started_at IS NULL);
    RETURN QUERY SELECT true, 'ok'::text, v_in_flight, v_hour;
    RETURN;
  END IF;

  SELECT COALESCE((SELECT s.enabled FROM public.agent_settings s WHERE s.organization_id = _organization_id), true)
    INTO v_enabled;
  SELECT count(*)::integer INTO v_in_flight FROM public.agent_run_admissions
    WHERE organization_id = _organization_id AND status IN ('queued', 'running');
  SELECT count(*)::integer INTO v_hour FROM public.agent_run_admissions
    WHERE organization_id = _organization_id AND created_at > now() - interval '1 hour'
      AND NOT (status = 'cancelled' AND started_at IS NULL);

  IF NOT v_enabled THEN
    RETURN QUERY SELECT false, 'workspace_disabled'::text, v_in_flight, v_hour;
    RETURN;
  END IF;
  IF v_in_flight >= _max_concurrent THEN
    RETURN QUERY SELECT false, 'too_many_running'::text, v_in_flight, v_hour;
    RETURN;
  END IF;
  IF v_hour >= _max_per_hour THEN
    RETURN QUERY SELECT false, 'hourly_limit'::text, v_in_flight, v_hour;
    RETURN;
  END IF;

  INSERT INTO public.agent_run_admissions (organization_id, run_id) VALUES (_organization_id, _run_id);
  RETURN QUERY SELECT true, 'ok'::text, v_in_flight + 1, v_hour + 1;
END $$;

CREATE OR REPLACE FUNCTION public.agent_limits_mark_started(_run_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    UPDATE public.agent_run_admissions
       SET status = 'running', started_at = COALESCE(started_at, now())
     WHERE run_id = _run_id AND status = 'queued'
     RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u);
$$;

CREATE OR REPLACE FUNCTION public.agent_limits_mark_finished(_run_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    UPDATE public.agent_run_admissions
       SET status = 'finished', finished_at = now()
     WHERE run_id = _run_id AND status IN ('queued', 'running')
     RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- Kill switch sweep: cancel queued (not yet started) admissions for one
-- workspace, or for every workspace when _organization_id is NULL. Returns the
-- run ids so the caller can cancel the matching agent_runs rows.
CREATE OR REPLACE FUNCTION public.agent_limits_cancel_queued(_organization_id uuid, _reason text)
RETURNS TABLE (run_id uuid, organization_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.agent_run_admissions a
     SET status = 'cancelled', cancel_reason = left(_reason, 200), finished_at = now()
   WHERE a.status = 'queued'
     AND (_organization_id IS NULL OR a.organization_id = _organization_id)
  RETURNING a.run_id, a.organization_id;
$$;

REVOKE ALL ON FUNCTION public.agent_limits_admit_run(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_limits_mark_started(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_limits_mark_finished(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_limits_cancel_queued(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_limits_admit_run(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_limits_mark_started(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_limits_mark_finished(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_limits_cancel_queued(uuid, text) TO service_role;
