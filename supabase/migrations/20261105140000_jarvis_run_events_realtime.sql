-- JC-32: publish jarvis_run_events for Supabase Realtime so RunTaskTree can
-- subscribe instead of polling every 2s. Idempotent: a second apply is a no-op.
-- RLS on jarvis_run_events remains the data boundary (owner/member read only).
-- There is deliberately no public/unauthenticated stream.
--
-- MANAGER REVIEW REQUIRED before applying in production. The client keeps its
-- polling fallback until the channel is SUBSCRIBED (see run-events-realtime.ts).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.jarvis_run_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
