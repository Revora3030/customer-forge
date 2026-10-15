CREATE TABLE public.jarvis_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) <= 40000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.jarvis_messages TO authenticated;
GRANT ALL ON public.jarvis_messages TO service_role;
ALTER TABLE public.jarvis_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own jarvis messages read" ON public.jarvis_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own jarvis messages delete" ON public.jarvis_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX jarvis_messages_user_created ON public.jarvis_messages (user_id, created_at);