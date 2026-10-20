-- Single-flight lock for the prospect-replies job.
--
-- runProspectReplies (drain the send queue, poll Gmail threads, follow up)
-- must never run twice at once. The prospect_reply_poll_state singleton gets
-- a lease: claim_prospect_reply_poll takes it with one atomic UPDATE that only
-- matches while the lease is free or expired, and returns the row when it
-- did. No row back means another run holds it (the job answers "busy"). The
-- run clears lease_owner/leased_until when it finishes; a run that dies frees
-- the lease when leased_until passes.
--
-- Additive and idempotent. Service-role only, like the table (RLS on, no policies).
-- Until this is applied the job runs without the lock, as before, and logs that.

BEGIN;

ALTER TABLE public.prospect_reply_poll_state ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE public.prospect_reply_poll_state ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ;

-- The claim only updates the singleton, so make sure it exists.
INSERT INTO public.prospect_reply_poll_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_prospect_reply_poll(p_owner TEXT, p_seconds INTEGER DEFAULT 900)
RETURNS SETOF public.prospect_reply_poll_state
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.prospect_reply_poll_state s
  SET leased_until = now() + make_interval(secs => GREATEST(30, LEAST(COALESCE(p_seconds, 900), 3600))),
      lease_owner = left(p_owner, 120)
  WHERE s.id = 1
    AND (s.leased_until IS NULL OR s.leased_until < now())
  RETURNING s.*;
$$;

REVOKE ALL ON FUNCTION public.claim_prospect_reply_poll(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_prospect_reply_poll(TEXT, INTEGER) TO service_role;

COMMENT ON COLUMN public.prospect_reply_poll_state.lease_owner IS 'Run id holding the prospect-replies single-flight lease; null when free.';
COMMENT ON COLUMN public.prospect_reply_poll_state.leased_until IS 'When the current prospect-replies lease expires; a lease past this time can be claimed again.';
COMMENT ON FUNCTION public.claim_prospect_reply_poll(TEXT, INTEGER) IS 'Atomically claims the prospect-replies single-flight lease; returns the singleton row when claimed, nothing when another run holds it.';

COMMIT;
