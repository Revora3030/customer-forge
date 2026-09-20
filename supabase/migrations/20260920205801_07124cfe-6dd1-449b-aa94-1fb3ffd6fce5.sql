CREATE TABLE public.luna_budget_state (
  month TEXT PRIMARY KEY,
  cap_microcents BIGINT NOT NULL DEFAULT 2000000000,
  spent_microcents BIGINT NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.luna_usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_microcents BIGINT NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX luna_usage_events_created_idx ON public.luna_usage_events (created_at DESC);

GRANT SELECT ON public.luna_budget_state TO authenticated;
GRANT SELECT ON public.luna_usage_events TO authenticated;
GRANT ALL ON public.luna_budget_state TO service_role;
GRANT ALL ON public.luna_usage_events TO service_role;

ALTER TABLE public.luna_budget_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "luna_budget_state super admin read" ON public.luna_budget_state
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_accounts pa WHERE pa.user_id = auth.uid()));

CREATE POLICY "luna_usage_events super admin read" ON public.luna_usage_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_accounts pa WHERE pa.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.luna_budget_reserve(
  _estimate_microcents BIGINT,
  _cap_microcents BIGINT DEFAULT NULL
) RETURNS TABLE(allowed BOOLEAN, spent_microcents BIGINT, cap_microcents BIGINT, calls INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month TEXT := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  _row public.luna_budget_state;
BEGIN
  INSERT INTO public.luna_budget_state (month, cap_microcents)
  VALUES (_month, COALESCE(_cap_microcents, 2000000000))
  ON CONFLICT (month) DO NOTHING;

  SELECT * INTO _row FROM public.luna_budget_state WHERE month = _month FOR UPDATE;

  IF _cap_microcents IS NOT NULL AND _cap_microcents <> _row.cap_microcents THEN
    UPDATE public.luna_budget_state SET cap_microcents = _cap_microcents, updated_at = now()
    WHERE month = _month RETURNING * INTO _row;
  END IF;

  IF _row.spent_microcents + GREATEST(_estimate_microcents, 0) > _row.cap_microcents THEN
    RETURN QUERY SELECT false, _row.spent_microcents, _row.cap_microcents, _row.calls;
    RETURN;
  END IF;

  UPDATE public.luna_budget_state
  SET spent_microcents = spent_microcents + GREATEST(_estimate_microcents, 0),
      calls = calls + 1,
      updated_at = now()
  WHERE month = _month
  RETURNING * INTO _row;

  RETURN QUERY SELECT true, _row.spent_microcents, _row.cap_microcents, _row.calls;
END;
$$;

CREATE OR REPLACE FUNCTION public.luna_budget_settle(
  _estimate_microcents BIGINT,
  _actual_microcents BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month TEXT := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  _spent BIGINT;
BEGIN
  UPDATE public.luna_budget_state
  SET spent_microcents = GREATEST(spent_microcents - GREATEST(_estimate_microcents, 0) + GREATEST(_actual_microcents, 0), 0),
      updated_at = now()
  WHERE month = _month
  RETURNING spent_microcents INTO _spent;
  RETURN COALESCE(_spent, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.luna_budget_reserve(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.luna_budget_settle(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luna_budget_reserve(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.luna_budget_settle(BIGINT, BIGINT) TO service_role;