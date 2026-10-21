CREATE TABLE public.jarvis_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message_id uuid,
  step integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('model_call','tool','proposal','approval','error','cancelled')),
  tool_id text,
  label text,
  status text NOT NULL CHECK (status IN ('running','ok','failed','rejected','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  input_summary text CHECK (char_length(input_summary) <= 500),
  output_summary text CHECK (char_length(output_summary) <= 1500),
  error text CHECK (char_length(error) <= 300),
  artifact_url text CHECK (char_length(artifact_url) <= 500),
  provider text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jarvis_run_events TO authenticated;
GRANT ALL ON public.jarvis_run_events TO service_role;
ALTER TABLE public.jarvis_run_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own jarvis run events read" ON public.jarvis_run_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX jarvis_run_events_user_created ON public.jarvis_run_events (user_id, created_at DESC);
CREATE INDEX jarvis_run_events_run ON public.jarvis_run_events (run_id, step);
ALTER TABLE public.jarvis_messages ADD COLUMN run_id uuid;