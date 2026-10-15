BEGIN;

-- Durable safety settings. The initial state is deliberately disabled with the kill switch engaged.
CREATE TABLE IF NOT EXISTS public.jarvis_autopilot_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  enabled boolean NOT NULL DEFAULT false,
  kill_switch_engaged boolean NOT NULL DEFAULT true,
  max_actions_per_run integer NOT NULL DEFAULT 4 CHECK (max_actions_per_run BETWEEN 1 AND 20),
  max_run_duration_seconds integer NOT NULL DEFAULT 60 CHECK (max_run_duration_seconds BETWEEN 1 AND 300),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.jarvis_autopilot_settings (id, enabled, kill_switch_engaged)
VALUES (true, false, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.jarvis_autopilot_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jarvis_autopilot_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jarvis_autopilot_settings TO service_role;

-- An approval records the exact action payload hash, not just a free-form note.
ALTER TABLE public.jarvis_autopilot_actions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approval_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS input_hash text,
  ADD COLUMN IF NOT EXISTS approved_input_hash text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'not_run',
  ADD COLUMN IF NOT EXISTS verification_summary text NOT NULL DEFAULT '';

UPDATE public.jarvis_autopilot_actions
SET approval_status = 'pending'
WHERE access = 'write' AND approval_status = 'not_required';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jarvis_autopilot_actions_approval_status_check'
      AND conrelid = 'public.jarvis_autopilot_actions'::regclass
  ) THEN
    ALTER TABLE public.jarvis_autopilot_actions
      ADD CONSTRAINT jarvis_autopilot_actions_approval_status_check
      CHECK (approval_status IN ('not_required','pending','approved','rejected','expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jarvis_autopilot_actions_verification_status_check'
      AND conrelid = 'public.jarvis_autopilot_actions'::regclass
  ) THEN
    ALTER TABLE public.jarvis_autopilot_actions
      ADD CONSTRAINT jarvis_autopilot_actions_verification_status_check
      CHECK (verification_status IN ('not_run','pending','passed','failed','unavailable'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jarvis_autopilot_actions_input_hash_check'
      AND conrelid = 'public.jarvis_autopilot_actions'::regclass
  ) THEN
    ALTER TABLE public.jarvis_autopilot_actions
      ADD CONSTRAINT jarvis_autopilot_actions_input_hash_check
      CHECK (
        (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$')
        AND (approved_input_hash IS NULL OR approved_input_hash ~ '^[a-f0-9]{64}$')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jarvis_autopilot_actions_access_approval_check'
      AND conrelid = 'public.jarvis_autopilot_actions'::regclass
  ) THEN
    ALTER TABLE public.jarvis_autopilot_actions
      ADD CONSTRAINT jarvis_autopilot_actions_access_approval_check
      CHECK (
        (access = 'read' AND approval_status = 'not_required')
        OR (access = 'write' AND approval_status IN ('pending','approved','rejected','expired'))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jarvis_autopilot_actions_write_execution_approval_check'
      AND conrelid = 'public.jarvis_autopilot_actions'::regclass
  ) THEN
    ALTER TABLE public.jarvis_autopilot_actions
      ADD CONSTRAINT jarvis_autopilot_actions_write_execution_approval_check
      CHECK (
        access = 'read'
        OR status NOT IN ('running','succeeded','failed','verification_failed')
        OR (
          approval_status = 'approved'
          AND approved_by IS NOT NULL
          AND approved_at IS NOT NULL
          AND approval_expires_at IS NOT NULL
          AND input_hash IS NOT NULL
          AND approved_input_hash = input_hash
          AND started_at IS NOT NULL
          AND approval_expires_at > started_at
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jarvis_autopilot_actions_success_verification_check'
      AND conrelid = 'public.jarvis_autopilot_actions'::regclass
  ) THEN
    ALTER TABLE public.jarvis_autopilot_actions
      ADD CONSTRAINT jarvis_autopilot_actions_success_verification_check
      CHECK (access = 'read' OR status <> 'succeeded' OR verification_status = 'passed');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS jarvis_autopilot_actions_approval_status_idx
  ON public.jarvis_autopilot_actions(approval_status, approval_expires_at);

-- Protect audit history against accidental application-level UPDATE/DELETE, including through service-role connections.
CREATE OR REPLACE FUNCTION public.jarvis_autopilot_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Jarvis audit events are append-only.'
    USING ERRCODE = '55000';
END;
$function$;

REVOKE ALL ON FUNCTION public.jarvis_autopilot_reject_audit_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS jarvis_autopilot_audit_events_append_only
  ON public.jarvis_autopilot_audit_events;
CREATE TRIGGER jarvis_autopilot_audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.jarvis_autopilot_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.jarvis_autopilot_reject_audit_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON public.jarvis_autopilot_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.jarvis_autopilot_audit_events TO service_role;

COMMENT ON TABLE public.jarvis_autopilot_settings IS 'Server-only Jarvis controls; autopilot starts disabled and kill switch engaged.';
COMMENT ON COLUMN public.jarvis_autopilot_actions.input_hash IS 'SHA-256 of canonical validated arguments; never raw credentials or arguments.';
COMMENT ON COLUMN public.jarvis_autopilot_actions.approved_input_hash IS 'Exact argument digest approved by an administrator; must equal input_hash before write execution.';
COMMENT ON COLUMN public.jarvis_autopilot_actions.approval_expires_at IS 'Approval expiry; write execution must begin before this timestamp.';
COMMENT ON COLUMN public.jarvis_autopilot_actions.verification_status IS 'Independent postcondition verification state; a write cannot be marked succeeded unless passed.';
COMMENT ON TABLE public.jarvis_autopilot_audit_events IS 'Append-only audit trail; application roles cannot update or delete events.';

COMMIT;
