CREATE TABLE public.ai_command_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pinned_models text[] NOT NULL DEFAULT '{}',
  paused_models text[] NOT NULL DEFAULT '{}',
  qa_auto_revert boolean NOT NULL DEFAULT true,
  qa_min_score integer NOT NULL DEFAULT 70 CHECK (qa_min_score BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.ai_command_settings TO service_role;
GRANT SELECT ON public.ai_command_settings TO authenticated;
ALTER TABLE public.ai_command_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read the AI command settings"
  ON public.ai_command_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.ai_command_settings (id) VALUES (1) ON CONFLICT DO NOTHING;