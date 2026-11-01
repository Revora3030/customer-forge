-- PAI-17: owner routines (server side). Additive only: one new table, one new
-- trigger function, a few new functions; nothing existing is altered.
--
-- A routine is a saved schedule (daily / weekly / monthly, America/New_York
-- wall-clock) that starts an agent run (agent_runs, PAI-2) for a workspace.
-- Routines can never send anything on their own: every run they create carries a
-- send policy of 'approval_required' or 'no_external_actions' in its checkpoint,
-- and there is no column or function that sets anything looser.
--
-- Firing is exactly-once per slot: a pass claims a due routine with a token,
-- then creates the run and moves next_run_at forward in ONE transaction that
-- checks the token. next_run_at is computed from "now", so a routine that was
-- missed for days fires once and then moves on, never N times.
-- Suspended workspaces are never claimed, so they get no runs.

CREATE TABLE IF NOT EXISTS public.agent_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 80),
  preset text NOT NULL CHECK (preset IN ('weekly_digest', 'review_asks', 'site_refresh', 'custom')),
  prompt text CHECK (prompt IS NULL OR length(prompt) <= 2000),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  weekday smallint CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  month_day smallint CHECK (month_day IS NULL OR month_day BETWEEN 1 AND 28),
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  minute smallint NOT NULL CHECK (minute BETWEEN 0 AND 59),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL,
  claim_token uuid,
  claimed_until timestamptz,
  last_run_at timestamptz,
  last_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (frequency <> 'weekly' OR weekday IS NOT NULL),
  CHECK (frequency <> 'monthly' OR month_day IS NOT NULL),
  CHECK (preset <> 'custom' OR prompt IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS agent_routines_org_idx ON public.agent_routines (organization_id);
CREATE INDEX IF NOT EXISTS agent_routines_due_idx ON public.agent_routines (next_run_at) WHERE enabled;

ALTER TABLE public.agent_routines ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_routines TO authenticated;
GRANT ALL ON public.agent_routines TO service_role;
DROP POLICY IF EXISTS agent_routines_member_read ON public.agent_routines;
CREATE POLICY agent_routines_member_read ON public.agent_routines
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- At most 5 routines per workspace (serialised per workspace so two inserts cannot both pass).
CREATE OR REPLACE FUNCTION public.agent_routines_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agent_routines:' || NEW.organization_id::text));
  IF (SELECT count(*) FROM public.agent_routines WHERE organization_id = NEW.organization_id) >= 5 THEN
    RAISE EXCEPTION 'routine_limit: a workspace can have at most 5 routines' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agent_routines_limit_trg ON public.agent_routines;
CREATE TRIGGER agent_routines_limit_trg BEFORE INSERT ON public.agent_routines
  FOR EACH ROW EXECUTE FUNCTION public.agent_routines_limit();

-- Claim due routines for this pass. Skips disabled routines, suspended workspaces
-- and routines another pass holds.
CREATE OR REPLACE FUNCTION public.agent_routine_claim_due(_limit integer DEFAULT 10, _lease_seconds integer DEFAULT 300)
RETURNS SETOF public.agent_routines
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_routines;
BEGIN
  FOR r IN
    SELECT ar.* FROM public.agent_routines ar
      JOIN public.organizations o ON o.id = ar.organization_id
     WHERE ar.enabled AND ar.next_run_at <= now()
       AND (ar.claimed_until IS NULL OR ar.claimed_until < now())
       AND NOT o.is_suspended
     ORDER BY ar.next_run_at LIMIT greatest(1, least(_limit, 50))
     FOR UPDATE OF ar SKIP LOCKED
  LOOP
    UPDATE public.agent_routines
       SET claim_token = gen_random_uuid(),
           claimed_until = now() + make_interval(secs => greatest(30, _lease_seconds)), updated_at = now()
     WHERE id = r.id RETURNING * INTO r;
    RETURN NEXT r;
  END LOOP;
END $$;

-- Create the run and move the schedule on, atomically, only for the token holder.
-- Returns the new run id, or NULL when the claim was lost or the workspace is now suspended.
CREATE OR REPLACE FUNCTION public.agent_routine_fire(_id uuid, _token uuid, _next_run_at timestamptz, _goal text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_routines; run public.agent_runs;
BEGIN
  SELECT * INTO r FROM public.agent_routines
   WHERE id = _id AND claim_token = _token AND enabled FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = r.organization_id AND is_suspended) THEN RETURN NULL; END IF;
  run := public.agent_run_create(r.organization_id, r.created_by, _goal, 'routine', NULL, 2);
  UPDATE public.agent_runs
     SET checkpoint = jsonb_build_object('routine', jsonb_build_object(
           'id', r.id, 'preset', r.preset,
           'send_policy', CASE WHEN r.preset IN ('weekly_digest', 'site_refresh') THEN 'no_external_actions' ELSE 'approval_required' END))
   WHERE id = run.id;
  UPDATE public.agent_routines
     SET next_run_at = _next_run_at, last_run_at = now(), last_run_id = run.id, last_status = 'queued',
         claim_token = NULL, claimed_until = NULL, updated_at = now()
   WHERE id = r.id;
  RETURN run.id;
END $$;

-- Give up on this slot (bad schedule, error): move on without creating a run.
CREATE OR REPLACE FUNCTION public.agent_routine_release(_id uuid, _token uuid, _next_run_at timestamptz, _status text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.agent_routines
     SET next_run_at = _next_run_at, last_status = left(_status, 200),
         claim_token = NULL, claimed_until = NULL, updated_at = now()
   WHERE id = _id AND claim_token = _token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION
  public.agent_routines_limit(),
  public.agent_routine_claim_due(integer, integer),
  public.agent_routine_fire(uuid, uuid, timestamptz, text),
  public.agent_routine_release(uuid, uuid, timestamptz, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.agent_routine_claim_due(integer, integer),
  public.agent_routine_fire(uuid, uuid, timestamptz, text),
  public.agent_routine_release(uuid, uuid, timestamptz, text)
TO service_role;

-- Check for due routines every 5 minutes (same guards as the other schedules).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; routine schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; routine schedule was not changed.';
    RETURN;
  END IF;
  PERFORM cron.schedule('revora-agent-routines', '*/5 * * * *', $cmd$select public.call_revora_job('agent-routines', 55000)$cmd$);
END $$;
