ALTER TABLE public.prospect_reply_poll_state ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE public.prospect_reply_poll_state ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ;
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