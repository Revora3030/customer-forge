-- Gmail gateway, send queue and inbound replies for prospect outreach.
--
-- 1. prospect_outreach gains nullable Gmail columns (gmail_id, gmail_thread_id,
--    rfc_message_id), the provider that carried the send, a kind
--    (first_touch | reply) and the inbound message a reply answered. The column
--    is deliberately NOT named gmail_message_id: 20261019090300 renames any
--    prospect_outreach that has that column (the retired orphan shape), so
--    re-running it must never match the outreach log.
-- 2. The one-autopilot-send-per-demo-per-channel guarantee now covers first
--    touches only, so in-thread auto-replies (mode autopilot, kind reply) can
--    be recorded. The new index is created before the old one is dropped.
-- 3. prospect_send_queue: autopilot sends wait here until not_before (a random
--    0-20 minute spacing). claim_prospect_send_queue leases due rows with one
--    UPDATE ... RETURNING (FOR UPDATE SKIP LOCKED), so overlapping drains never
--    claim the same row; an expired lease can be claimed again.
-- 4. prospect_inbound: replies read from Gmail threads, their intent and what
--    was done (auto reply, draft for the operator, do-not-contact).
-- 5. prospect_reply_poll_state: singleton with the last poll time.
-- 6. Every 10 minutes: call_revora_job('prospect-replies', 900000), guarded like
--    20261019090200.
-- Additive and service-role only: RLS on with no policies.

BEGIN;

ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS gmail_id TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'first_touch';
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS inbound_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospect_outreach_kind_check') THEN
    ALTER TABLE public.prospect_outreach ADD CONSTRAINT prospect_outreach_kind_check CHECK (kind IN ('first_touch', 'reply'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_one_autopilot_first_touch_idx
  ON public.prospect_outreach (organization_id, channel)
  WHERE status = 'sent' AND mode = 'autopilot' AND kind = 'first_touch';
DROP INDEX IF EXISTS public.prospect_outreach_one_autopilot_send_idx;
CREATE INDEX IF NOT EXISTS prospect_outreach_gmail_thread_idx
  ON public.prospect_outreach (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.prospect_send_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  mode TEXT NOT NULL DEFAULT 'autopilot' CHECK (mode IN ('manual', 'autopilot')),
  not_before TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  last_error TEXT,
  outreach_id UUID,
  leased_until TIMESTAMPTZ,
  lease_owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_send_queue_pkey PRIMARY KEY (id)
);
-- One waiting send per demo per channel: a repeated enqueue is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_send_queue_one_queued_idx
  ON public.prospect_send_queue (organization_id, channel)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS prospect_send_queue_due_idx
  ON public.prospect_send_queue (not_before)
  WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.claim_prospect_send_queue(p_owner TEXT, p_limit INTEGER DEFAULT 3, p_lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF public.prospect_send_queue
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.prospect_send_queue q
  SET leased_until = now() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 3600))),
      lease_owner = left(p_owner, 120),
      attempts = q.attempts + 1,
      updated_at = now()
  WHERE q.id IN (
    SELECT id FROM public.prospect_send_queue
    WHERE status = 'queued'
      AND not_before <= now()
      AND (leased_until IS NULL OR leased_until < now())
    ORDER BY not_before
    LIMIT GREATEST(1, LEAST(p_limit, 20))
    FOR UPDATE SKIP LOCKED
  )
  AND q.status = 'queued'
  AND (q.leased_until IS NULL OR q.leased_until < now())
  RETURNING q.*;
$$;

CREATE TABLE IF NOT EXISTS public.prospect_inbound (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outreach_id UUID,
  thread_id TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL,
  rfc_message_id TEXT,
  references_ids TEXT[] NOT NULL DEFAULT '{}',
  from_address TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  body TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  intent TEXT NOT NULL CHECK (intent IN ('positive', 'price', 'question', 'objection', 'stop', 'unclear')),
  confidence NUMERIC(4, 3),
  intent_source TEXT NOT NULL DEFAULT 'ai' CHECK (intent_source IN ('keyword', 'ai', 'fallback')),
  flags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'awaiting_operator', 'handled', 'dismissed')),
  action TEXT,
  handled_at TIMESTAMPTZ,
  draft_subject TEXT,
  draft_text TEXT,
  draft_reason TEXT,
  reply_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_inbound_pkey PRIMARY KEY (id),
  CONSTRAINT prospect_inbound_gmail_message_key UNIQUE (gmail_message_id)
);
CREATE INDEX IF NOT EXISTS prospect_inbound_status_idx ON public.prospect_inbound (status, received_at DESC);
CREATE INDEX IF NOT EXISTS prospect_inbound_thread_idx ON public.prospect_inbound (thread_id);

CREATE TABLE IF NOT EXISTS public.prospect_reply_poll_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_polled_at TIMESTAMPTZ,
  last_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.prospect_reply_poll_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.prospect_send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_reply_poll_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_send_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.prospect_inbound FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.prospect_reply_poll_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.prospect_send_queue TO service_role;
GRANT ALL ON public.prospect_inbound TO service_role;
GRANT ALL ON public.prospect_reply_poll_state TO service_role;
REVOKE ALL ON FUNCTION public.claim_prospect_send_queue(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_prospect_send_queue(TEXT, INTEGER, INTEGER) TO service_role;

COMMENT ON TABLE public.prospect_send_queue IS 'Autopilot outreach waiting for its not_before; drained by the prospect-replies job with leased claims.';
COMMENT ON TABLE public.prospect_inbound IS 'Prospect replies read from Gmail, with intent and the action taken (auto reply, operator draft, do-not-contact).';

COMMIT;

-- Every 10 minutes: drain the send queue, poll Gmail threads, follow up.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; prospect replies schedule not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; schedules not changed.';
    RETURN;
  END IF;
  PERFORM cron.schedule(
    'revora-prospect-replies',
    '*/10 * * * *',
    $cmd$select public.call_revora_job('prospect-replies', 900000)$cmd$
  );
END $$;
