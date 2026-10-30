ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS gmail_id TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'first_touch';
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS inbound_id UUID;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS auto_reply_seq SMALLINT;
ALTER TABLE public.prospect_outreach ADD COLUMN IF NOT EXISTS replies_checked_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospect_outreach_kind_check') THEN
    ALTER TABLE public.prospect_outreach ADD CONSTRAINT prospect_outreach_kind_check CHECK (kind IN ('first_touch', 'reply'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospect_outreach_auto_reply_seq_check') THEN
    ALTER TABLE public.prospect_outreach ADD CONSTRAINT prospect_outreach_auto_reply_seq_check CHECK (
      CASE WHEN kind = 'reply' AND mode = 'autopilot'
        THEN auto_reply_seq IS NOT NULL AND auto_reply_seq BETWEEN 1 AND 2
        ELSE auto_reply_seq IS NULL
      END
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_one_autopilot_first_touch_idx
  ON public.prospect_outreach (organization_id, channel)
  WHERE status = 'sent' AND mode = 'autopilot' AND kind = 'first_touch';
DROP INDEX IF EXISTS public.prospect_outreach_one_autopilot_send_idx;
CREATE INDEX IF NOT EXISTS prospect_outreach_gmail_thread_idx
  ON public.prospect_outreach (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_auto_reply_slot_idx
  ON public.prospect_outreach (gmail_thread_id, auto_reply_seq)
  WHERE status = 'sent' AND kind = 'reply' AND mode = 'autopilot';
CREATE INDEX IF NOT EXISTS prospect_outreach_reply_poll_idx
  ON public.prospect_outreach (replies_checked_at NULLS FIRST, created_at DESC)
  WHERE channel = 'email' AND status = 'sent' AND kind = 'first_touch' AND gmail_thread_id IS NOT NULL;
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