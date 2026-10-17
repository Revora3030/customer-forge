-- Daily dollar cap for paid AI.
--
-- The owner chose to let the builder use paid models for its hardest steps up
-- to a daily cap, then fall back to the free pool. Every paid call (the
-- Sol/Terra/Luna collective and the router's direct OpenAI/Google calls)
-- reserves an over-estimate here before it runs and settles the real cost
-- afterwards, so the cap binds before money is spent. Days are UTC. Only the
-- service role can touch it.

CREATE TABLE IF NOT EXISTS public.ai_paid_daily_budget (
  day DATE PRIMARY KEY,
  cap_microcents BIGINT NOT NULL DEFAULT 0,
  spent_microcents BIGINT NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_paid_daily_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_paid_daily_budget FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_paid_budget_reserve(
  _estimate_microcents BIGINT,
  _cap_microcents BIGINT
)
RETURNS TABLE(allowed BOOLEAN, day DATE, spent_microcents BIGINT, cap_microcents BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _day DATE := (now() AT TIME ZONE 'utc')::date;
  _estimate BIGINT := GREATEST(COALESCE(_estimate_microcents, 0), 0);
  _cap BIGINT := GREATEST(COALESCE(_cap_microcents, 0), 0);
  _spent BIGINT;
BEGIN
  INSERT INTO public.ai_paid_daily_budget AS b (day, cap_microcents)
  VALUES (_day, _cap)
  ON CONFLICT (day) DO UPDATE SET cap_microcents = _cap, updated_at = now();

  SELECT b.spent_microcents INTO _spent
  FROM public.ai_paid_daily_budget b
  WHERE b.day = _day
  FOR UPDATE;

  IF _cap = 0 OR _spent + _estimate > _cap THEN
    RETURN QUERY SELECT FALSE, _day, _spent, _cap;
    RETURN;
  END IF;

  UPDATE public.ai_paid_daily_budget b
     SET spent_microcents = b.spent_microcents + _estimate,
         calls = b.calls + 1,
         updated_at = now()
   WHERE b.day = _day
   RETURNING b.spent_microcents INTO _spent;

  RETURN QUERY SELECT TRUE, _day, _spent, _cap;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_paid_budget_settle(
  _day DATE,
  _estimate_microcents BIGINT,
  _actual_microcents BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ai_paid_daily_budget b
     SET spent_microcents = GREATEST(
           b.spent_microcents - GREATEST(COALESCE(_estimate_microcents, 0), 0)
             + GREATEST(COALESCE(_actual_microcents, 0), 0),
           0
         ),
         updated_at = now()
   WHERE b.day = _day;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_paid_budget_settle(DATE, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_paid_budget_settle(DATE, BIGINT, BIGINT) TO service_role;
