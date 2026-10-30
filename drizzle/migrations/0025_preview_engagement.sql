CREATE TABLE IF NOT EXISTS public.prospect_preview_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  token TEXT NOT NULL CHECK (char_length(token) BETWEEN 16 AND 80),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('view', 'heartbeat', 'claim_hover', 'claim_click')),
  page TEXT NOT NULL DEFAULT 'home' CHECK (char_length(page) BETWEEN 1 AND 80),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 600000),
  session_id TEXT CHECK (session_id IS NULL OR char_length(session_id) <= 64),
  ip_hash TEXT CHECK (ip_hash IS NULL OR char_length(ip_hash) <= 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_preview_events_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS prospect_preview_events_org_created_idx
  ON public.prospect_preview_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prospect_preview_events_rate_idx
  ON public.prospect_preview_events (token, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS prospect_preview_events_created_idx
  ON public.prospect_preview_events (created_at);
ALTER TABLE public.prospect_preview_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_preview_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.prospect_preview_events TO service_role;
COMMENT ON TABLE public.prospect_preview_events IS
  'Anonymous prospect demo preview engagement (no cookies, HMAC-hashed IPs); service-role only; pruned after 90 days.';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; preview engagement prune not scheduled.';
    RETURN;
  END IF;
  PERFORM cron.schedule(
    'revora-prospect-preview-events-prune',
    '41 3 * * *',
    $cmd$delete from public.prospect_preview_events where created_at < now() - interval '90 days'$cmd$
  );
END $$;