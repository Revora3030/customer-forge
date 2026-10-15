-- Jarvis Autopilot durable run/action ledger. Browser roles have no direct access.
CREATE TABLE IF NOT EXISTS public.jarvis_autopilot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','preflight','running','awaiting_approval','succeeded','failed','cancelled')),
  mode text NOT NULL DEFAULT 'safe' CHECK (mode IN ('safe','approval_required')),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(evidence::text) <= 24000),
  actions_planned integer NOT NULL DEFAULT 0 CHECK (actions_planned BETWEEN 0 AND 20),
  actions_completed integer NOT NULL DEFAULT 0 CHECK (actions_completed BETWEEN 0 AND 20),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.jarvis_autopilot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.jarvis_autopilot_runs(id) ON DELETE RESTRICT,
  tool_id text NOT NULL CHECK (tool_id ~ '^[a-z][a-z0-9_.-]{2,100}$'),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','awaiting_approval','running','succeeded','failed','blocked','verification_failed')),
  access text NOT NULL CHECK (access IN ('read','write')), risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  rationale text NOT NULL DEFAULT '' CHECK (char_length(rationale) <= 4000),
  input_summary text NOT NULL DEFAULT '' CHECK (char_length(input_summary) <= 4000),
  output_summary text NOT NULL DEFAULT '' CHECK (char_length(output_summary) <= 4000),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(evidence::text) <= 24000),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  failure_category text CHECK (failure_category IS NULL OR char_length(failure_category) <= 120),
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT, approved_at timestamptz,
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.jarvis_autopilot_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid REFERENCES public.jarvis_autopilot_runs(id) ON DELETE RESTRICT,
  action_id uuid REFERENCES public.jarvis_autopilot_actions(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  outcome text NOT NULL CHECK (outcome IN ('info','success','blocked','failure')),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 12000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_autopilot_runs_status_created_idx ON public.jarvis_autopilot_runs(status,created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_autopilot_runs_actor_created_idx ON public.jarvis_autopilot_runs(requested_by,created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_autopilot_actions_run_created_idx ON public.jarvis_autopilot_actions(run_id,created_at);
CREATE INDEX IF NOT EXISTS jarvis_autopilot_actions_status_created_idx ON public.jarvis_autopilot_actions(status,created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_autopilot_audit_run_created_idx ON public.jarvis_autopilot_audit_events(run_id,created_at);
CREATE INDEX IF NOT EXISTS jarvis_autopilot_audit_action_created_idx ON public.jarvis_autopilot_audit_events(action_id,created_at);
ALTER TABLE public.jarvis_autopilot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_autopilot_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_autopilot_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jarvis_autopilot_runs FROM anon,authenticated;
REVOKE ALL ON public.jarvis_autopilot_actions FROM anon,authenticated;
REVOKE ALL ON public.jarvis_autopilot_audit_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.jarvis_autopilot_runs TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.jarvis_autopilot_actions TO service_role;
GRANT SELECT,INSERT ON public.jarvis_autopilot_audit_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.jarvis_autopilot_audit_events_id_seq TO service_role;
COMMENT ON TABLE public.jarvis_autopilot_runs IS 'Bounded Jarvis operations runs; server-side super-admin authorization required.';
COMMENT ON TABLE public.jarvis_autopilot_actions IS 'Allowlisted proposed and executed Jarvis actions; secrets and raw payloads prohibited.';
COMMENT ON TABLE public.jarvis_autopilot_audit_events IS 'Append-only audit trail for Jarvis Autopilot run and action transitions.';
