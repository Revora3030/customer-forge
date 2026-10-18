-- Daily ElevenLabs character caps and replay-proof voice links.
--
-- Jarvis's voice spends the owner's ElevenLabs characters. Every ElevenLabs
-- call reserves its characters here first, per UTC day and per scope
-- ('visitor' for the public marketing Jarvis, 'admin' for super-admins), so
-- one leaked or scripted link can't drain the account. Each signed voice link
-- carries a random nonce; voice_link_claim counts its uses so a link can be
-- fetched only a few times (a Safari range probe plus one buffered retry).
-- Additive and service-role only: RLS on with no policies, no anon or
-- authenticated access.

CREATE TABLE IF NOT EXISTS public.voice_daily_budget (
  day DATE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('visitor', 'admin')),
  chars_cap INTEGER NOT NULL,
  chars_spent INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voice_daily_budget_pkey PRIMARY KEY (day, scope)
);

CREATE TABLE IF NOT EXISTS public.voice_link_claims (
  nonce TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT voice_link_claims_pkey PRIMARY KEY (nonce)
);

CREATE INDEX IF NOT EXISTS voice_link_claims_expires_at_idx ON public.voice_link_claims (expires_at);

ALTER TABLE public.voice_daily_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_link_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_daily_budget FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.voice_link_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.voice_budget_reserve(
  _scope TEXT,
  _chars INTEGER,
  _cap INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _day DATE := (now() AT TIME ZONE 'utc')::date;
  _amount INTEGER := GREATEST(COALESCE(_chars, 0), 0);
  _limit INTEGER := GREATEST(COALESCE(_cap, 0), 0);
  _spent INTEGER;
BEGIN
  IF _scope IS NULL OR _scope NOT IN ('visitor', 'admin') THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.voice_daily_budget AS b (day, scope, chars_cap)
  VALUES (_day, _scope, _limit)
  ON CONFLICT ON CONSTRAINT voice_daily_budget_pkey DO UPDATE SET chars_cap = _limit, updated_at = now();

  SELECT b.chars_spent INTO _spent
  FROM public.voice_daily_budget b
  WHERE b.day = _day AND b.scope = _scope
  FOR UPDATE;

  IF _limit = 0 OR _spent + _amount > _limit THEN
    RETURN FALSE;
  END IF;

  UPDATE public.voice_daily_budget b
     SET chars_spent = b.chars_spent + _amount,
         calls = b.calls + 1,
         updated_at = now()
   WHERE b.day = _day AND b.scope = _scope;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.voice_link_claim(
  _nonce TEXT,
  _max_uses INTEGER,
  _expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uses INTEGER;
BEGIN
  IF _nonce IS NULL OR length(_nonce) < 16 OR length(_nonce) > 64 OR _expires_at IS NULL THEN
    RETURN FALSE;
  END IF;

  -- A ten-minute margin past expiry so server clock skew can't reopen a
  -- link by pruning its count while the link still verifies.
  DELETE FROM public.voice_link_claims c WHERE c.expires_at < now() - interval '10 minutes';

  INSERT INTO public.voice_link_claims AS c (nonce, uses, expires_at)
  VALUES (_nonce, 1, _expires_at)
  ON CONFLICT ON CONSTRAINT voice_link_claims_pkey DO UPDATE SET uses = c.uses + 1
  RETURNING c.uses INTO _uses;

  RETURN _uses <= GREATEST(COALESCE(_max_uses, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.voice_budget_reserve(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_link_claim(TEXT, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_budget_reserve(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_link_claim(TEXT, INTEGER, TIMESTAMPTZ) TO service_role;
