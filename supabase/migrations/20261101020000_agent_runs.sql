-- PAI-2: durable agent run store (additive only: new tables, indexes and
-- functions; nothing existing is altered, dropped or renamed).
--
-- agent_runs         one row per long-running AI goal, with a lease, a fence
--                    counter, a checkpoint and a plain-English failure reason.
-- agent_run_steps    one row per step the run took (tool call, model turn).
-- agent_run_events   honest, ordered feed of things that actually happened.
--
-- Rows are read by members of the owning workspace (RLS). Every write goes
-- through the service role and the functions below, so a browser can never
-- create, edit or finish a run. The functions mirror the generation_jobs
-- lease pattern: a worker claims a run (fence + 1), keeps the lease alive with
-- heartbeats, and every later write must present the fence it was given, so a
-- worker that was cut off cannot overwrite the worker that resumed the run.

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  goal text NOT NULL CHECK (length(goal) BETWEEN 3 AND 4000),
  source text NOT NULL DEFAULT 'owner' CHECK (source IN ('owner', 'routine', 'admin', 'system')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'needs_approval', 'needs_input', 'done', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  fence integer NOT NULL DEFAULT 0,
  worker text,
  lease_expires_at timestamptz,
  not_before timestamptz NOT NULL DEFAULT now(),
  budget_cap numeric(12, 4) CHECK (budget_cap IS NULL OR budget_cap >= 0),
  budget_used numeric(12, 4) NOT NULL DEFAULT 0 CHECK (budget_used >= 0),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  error_plain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
  tool text CHECK (tool IS NULL OR length(tool) <= 80),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error', 'skipped')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (run_id, seq)
);

CREATE TABLE IF NOT EXISTS public.agent_run_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_org_created_idx ON public.agent_runs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_queue_idx ON public.agent_runs (not_before, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS agent_runs_lease_idx ON public.agent_runs (lease_expires_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS agent_run_steps_org_idx ON public.agent_run_steps (organization_id, run_id);
CREATE INDEX IF NOT EXISTS agent_run_events_run_idx ON public.agent_run_events (run_id, id);
CREATE INDEX IF NOT EXISTS agent_run_events_org_idx ON public.agent_run_events (organization_id, created_at DESC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.agent_runs, public.agent_run_steps, public.agent_run_events TO authenticated;
GRANT ALL ON public.agent_runs, public.agent_run_steps, public.agent_run_events TO service_role;

DROP POLICY IF EXISTS agent_runs_member_read ON public.agent_runs;
CREATE POLICY agent_runs_member_read ON public.agent_runs
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS agent_run_steps_member_read ON public.agent_run_steps;
CREATE POLICY agent_run_steps_member_read ON public.agent_run_steps
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS agent_run_events_member_read ON public.agent_run_events;
CREATE POLICY agent_run_events_member_read ON public.agent_run_events
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));

-- Create a run and its first event.
CREATE OR REPLACE FUNCTION public.agent_run_create(
  _org uuid, _user uuid, _goal text, _source text DEFAULT 'owner',
  _budget_cap numeric DEFAULT NULL, _max_attempts integer DEFAULT 3
) RETURNS public.agent_runs
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  INSERT INTO public.agent_runs (organization_id, user_id, goal, source, budget_cap, max_attempts)
  VALUES (_org, _user, left(btrim(_goal), 4000), _source, _budget_cap, least(10, greatest(1, _max_attempts)))
  RETURNING * INTO r;
  INSERT INTO public.agent_run_events (run_id, organization_id, kind, message)
  VALUES (r.id, r.organization_id, 'queued', 'Waiting for a worker to start.');
  RETURN r;
END $$;

-- Claim the oldest due queued run (none if there is nothing to do). Concurrent
-- workers skip rows another worker holds, so two workers never get one run.
CREATE OR REPLACE FUNCTION public.agent_run_claim(_worker text, _lease_seconds integer DEFAULT 120)
RETURNS SETOF public.agent_runs
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  SELECT * INTO r FROM public.agent_runs
   WHERE status = 'queued' AND not_before <= now()
   ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.agent_runs
     SET status = 'processing', worker = left(_worker, 80), fence = fence + 1, attempts = attempts + 1,
         lease_expires_at = now() + make_interval(secs => greatest(10, _lease_seconds)),
         started_at = coalesce(started_at, now()), updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  INSERT INTO public.agent_run_events (run_id, organization_id, kind, message, data)
  VALUES (r.id, r.organization_id, 'started',
          CASE WHEN r.attempts > 1 THEN 'Picked the run back up where it left off.' ELSE 'Started working.' END,
          jsonb_build_object('attempt', r.attempts));
  RETURN NEXT r;
END $$;

-- Extend the lease. False means this worker no longer owns the run.
CREATE OR REPLACE FUNCTION public.agent_run_heartbeat(_run uuid, _fence integer, _lease_seconds integer DEFAULT 120)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.agent_runs
     SET lease_expires_at = now() + make_interval(secs => greatest(10, _lease_seconds)), updated_at = now()
   WHERE id = _run AND fence = _fence AND status = 'processing';
  RETURN FOUND;
END $$;

-- Save progress. False means the fence is stale (another worker owns the run).
CREATE OR REPLACE FUNCTION public.agent_run_save(_run uuid, _fence integer, _checkpoint jsonb, _budget_used numeric DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.agent_runs
     SET checkpoint = coalesce(_checkpoint, '{}'::jsonb),
         budget_used = coalesce(_budget_used, budget_used), updated_at = now()
   WHERE id = _run AND fence = _fence AND status = 'processing';
  RETURN FOUND;
END $$;

-- Append a feed event (fenced, so a stale worker cannot write to the feed).
CREATE OR REPLACE FUNCTION public.agent_run_add_event(_run uuid, _fence integer, _kind text, _message text, _data jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE org uuid;
BEGIN
  SELECT organization_id INTO org FROM public.agent_runs WHERE id = _run AND fence = _fence AND status = 'processing';
  IF org IS NULL THEN RETURN false; END IF;
  INSERT INTO public.agent_run_events (run_id, organization_id, kind, message, data)
  VALUES (_run, org, left(_kind, 40), left(_message, 1000), coalesce(_data, '{}'::jsonb));
  RETURN true;
END $$;

-- Move the run out of "processing". 'queued' schedules a retry with backoff.
CREATE OR REPLACE FUNCTION public.agent_run_finish(
  _run uuid, _fence integer, _status text, _summary text DEFAULT NULL, _error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  IF _status NOT IN ('queued', 'needs_approval', 'needs_input', 'done', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid agent run status %', _status;
  END IF;
  UPDATE public.agent_runs
     SET status = _status, lease_expires_at = NULL, worker = NULL, updated_at = now(),
         result_summary = coalesce(left(_summary, 2000), result_summary),
         error_plain = CASE WHEN _status IN ('failed', 'queued') THEN left(_error, 1000) ELSE NULL END,
         not_before = CASE WHEN _status = 'queued' THEN now() + make_interval(secs => 30 * attempts) ELSE not_before END,
         finished_at = CASE WHEN _status IN ('done', 'failed', 'cancelled') THEN now() ELSE NULL END
   WHERE id = _run AND fence = _fence AND status = 'processing'
   RETURNING * INTO r;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.agent_run_events (run_id, organization_id, kind, message)
  VALUES (r.id, r.organization_id, _status,
          coalesce(nullif(left(coalesce(_error, _summary), 1000), ''), 'Run is now ' || _status || '.'));
  RETURN true;
END $$;

-- Owner/server cancel. Bumps the fence so a running worker's next write fails.
CREATE OR REPLACE FUNCTION public.agent_run_cancel(_run uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  UPDATE public.agent_runs
     SET status = 'cancelled', fence = fence + 1, lease_expires_at = NULL, worker = NULL,
         updated_at = now(), finished_at = now()
   WHERE id = _run AND status IN ('queued', 'processing', 'needs_approval', 'needs_input')
   RETURNING * INTO r;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.agent_run_events (run_id, organization_id, kind, message)
  VALUES (r.id, r.organization_id, 'cancelled', 'Cancelled.');
  RETURN true;
END $$;

-- Put a paused run (approval given / answer received) back in the queue.
CREATE OR REPLACE FUNCTION public.agent_run_resume(_run uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.agent_runs;
BEGIN
  UPDATE public.agent_runs
     SET status = 'queued', not_before = now(), updated_at = now(), max_attempts = max_attempts + 1
   WHERE id = _run AND status IN ('needs_approval', 'needs_input')
   RETURNING * INTO r;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.agent_run_events (run_id, organization_id, kind, message)
  VALUES (r.id, r.organization_id, 'resumed', 'Back in the queue.');
  RETURN true;
END $$;

-- Recover runs whose worker was cut off: lease lapsed past the grace period.
-- Retry from the checkpoint while attempts remain; otherwise fail with a plain reason.
CREATE OR REPLACE FUNCTION public.agent_run_recover_stalled(_grace_seconds integer DEFAULT 60)
RETURNS TABLE (run_id uuid, outcome text) LANGUAGE plpgsql SET search_path = public AS $$
#variable_conflict use_column
DECLARE r public.agent_runs;
BEGIN
  FOR r IN
    SELECT * FROM public.agent_runs
     WHERE status = 'processing'
       AND coalesce(lease_expires_at, updated_at) < now() - make_interval(secs => greatest(0, _grace_seconds))
     FOR UPDATE SKIP LOCKED
  LOOP
    IF r.attempts >= r.max_attempts THEN
      UPDATE public.agent_runs
         SET status = 'failed', fence = fence + 1, lease_expires_at = NULL, worker = NULL, updated_at = now(),
             finished_at = now(),
             error_plain = 'This run was interrupted ' || r.attempts || ' times and could not finish. Nothing further was done; you can start it again.'
       WHERE id = r.id;
      INSERT INTO public.agent_run_events (run_id, organization_id, kind, message)
      VALUES (r.id, r.organization_id, 'failed', 'The run was interrupted and could not finish after ' || r.attempts || ' tries.');
      run_id := r.id; outcome := 'failed'; RETURN NEXT;
    ELSE
      UPDATE public.agent_runs
         SET status = 'queued', fence = fence + 1, lease_expires_at = NULL, worker = NULL, updated_at = now(),
             not_before = now() + make_interval(secs => 30 * r.attempts),
             error_plain = 'The worker was interrupted; retrying from the last saved step.'
       WHERE id = r.id;
      INSERT INTO public.agent_run_events (run_id, organization_id, kind, message)
      VALUES (r.id, r.organization_id, 'stalled', 'The worker stopped responding. Retrying from the last saved step.');
      run_id := r.id; outcome := 'requeued'; RETURN NEXT;
    END IF;
  END LOOP;
END $$;

-- Server-only: browsers (anon / authenticated) cannot call any of these.
REVOKE ALL ON FUNCTION
  public.agent_run_create(uuid, uuid, text, text, numeric, integer),
  public.agent_run_claim(text, integer),
  public.agent_run_heartbeat(uuid, integer, integer),
  public.agent_run_save(uuid, integer, jsonb, numeric),
  public.agent_run_add_event(uuid, integer, text, text, jsonb),
  public.agent_run_finish(uuid, integer, text, text, text),
  public.agent_run_cancel(uuid),
  public.agent_run_resume(uuid),
  public.agent_run_recover_stalled(integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.agent_run_create(uuid, uuid, text, text, numeric, integer),
  public.agent_run_claim(text, integer),
  public.agent_run_heartbeat(uuid, integer, integer),
  public.agent_run_save(uuid, integer, jsonb, numeric),
  public.agent_run_add_event(uuid, integer, text, text, jsonb),
  public.agent_run_finish(uuid, integer, text, text, text),
  public.agent_run_cancel(uuid),
  public.agent_run_resume(uuid),
  public.agent_run_recover_stalled(integer)
TO service_role;

-- Worker kick every minute through public.call_revora_job (same guards as the
-- other schedules: does nothing where pg_cron or call_revora_job is missing,
-- re-running reschedules in place).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; agent run schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; agent run schedule was not changed.';
    RETURN;
  END IF;
  PERFORM cron.schedule('revora-agent-runs', '* * * * *', $cmd$select public.call_revora_job('agent-runs', 55000)$cmd$);
END $$;
