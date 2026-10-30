CREATE TABLE IF NOT EXISTS public.prospect_autopilot_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(targets) = 'array'),
  daily_build_cap integer NOT NULL DEFAULT 5 CHECK (daily_build_cap BETWEEN 0 AND 20),
  send_email boolean NOT NULL DEFAULT true,
  send_sms boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.prospect_autopilot_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.prospect_autopilot_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_autopilot_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.prospect_autopilot_settings TO service_role;
CREATE TABLE IF NOT EXISTS public.prospect_autopilot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger text NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron','manual')),
  found integer NOT NULL DEFAULT 0,
  built integer NOT NULL DEFAULT 0,
  emailed integer NOT NULL DEFAULT 0,
  texted integer NOT NULL DEFAULT 0,
  skipped jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_autopilot_runs_single_flight_idx
  ON public.prospect_autopilot_runs ((true))
  WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS prospect_autopilot_runs_started_at_idx
  ON public.prospect_autopilot_runs (started_at DESC);
ALTER TABLE public.prospect_autopilot_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_autopilot_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.prospect_autopilot_runs TO service_role;
COMMENT ON TABLE public.prospect_autopilot_settings IS 'Server-only prospect autopilot controls (singleton id=1); ships disabled.';
COMMENT ON TABLE public.prospect_autopilot_runs IS 'One row per prospect autopilot run; the partial unique index keeps runs single-flight.';