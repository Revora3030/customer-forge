CREATE TABLE public.jarvis_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note',
  content text NOT NULL,
  source text NOT NULL DEFAULT 'chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_memories TO authenticated;
GRANT ALL ON public.jarvis_memories TO service_role;

ALTER TABLE public.jarvis_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY jarvis_memories_owner ON public.jarvis_memories
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX jarvis_memories_user_idx ON public.jarvis_memories (user_id, created_at DESC);

CREATE TABLE public.jarvis_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  prompt text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily',
  hour integer NOT NULL DEFAULT 8,
  minute integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_routines TO authenticated;
GRANT ALL ON public.jarvis_routines TO service_role;

ALTER TABLE public.jarvis_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY jarvis_routines_owner ON public.jarvis_routines
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX jarvis_routines_due_idx ON public.jarvis_routines (enabled, frequency);