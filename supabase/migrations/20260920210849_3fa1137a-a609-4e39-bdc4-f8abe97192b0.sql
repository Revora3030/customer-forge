DROP FUNCTION IF EXISTS public.luna_budget_reserve(BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.luna_budget_settle(BIGINT, BIGINT);

CREATE FUNCTION public.luna_budget_reserve(
  _estimate_microcents BIGINT,
  _cap_microcents BIGINT DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, spent_microcents BIGINT, cap_microcents BIGINT, calls INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month TEXT := to_char(now(), 'YYYY-MM');
  _cap BIGINT;
  _spent BIGINT;
  _calls INT;
BEGIN
  INSERT INTO public.luna_budget_state (month)
  VALUES (_month)
  ON CONFLICT (month) DO NOTHING;

  SELECT s.cap_microcents, s.spent_microcents, s.calls
    INTO _cap, _spent, _calls
  FROM public.luna_budget_state s
  WHERE s.month = _month
  FOR UPDATE;

  IF _cap_microcents IS NOT NULL AND _cap_microcents <> _cap THEN
    UPDATE public.luna_budget_state s
       SET cap_microcents = _cap_microcents, updated_at = now()
     WHERE s.month = _month;
    _cap := _cap_microcents;
  END IF;

  IF _spent + GREATEST(_estimate_microcents, 0) > _cap THEN
    RETURN QUERY SELECT FALSE, _spent, _cap, _calls;
    RETURN;
  END IF;

  UPDATE public.luna_budget_state s
     SET spent_microcents = s.spent_microcents + GREATEST(_estimate_microcents, 0),
         calls = s.calls + 1,
         updated_at = now()
   WHERE s.month = _month
  RETURNING s.spent_microcents, s.cap_microcents, s.calls
      INTO _spent, _cap, _calls;

  RETURN QUERY SELECT TRUE, _spent, _cap, _calls;
END;
$$;

CREATE FUNCTION public.luna_budget_settle(
  _estimate_microcents BIGINT,
  _actual_microcents BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month TEXT := to_char(now(), 'YYYY-MM');
BEGIN
  UPDATE public.luna_budget_state s
     SET spent_microcents = GREATEST(
           s.spent_microcents - GREATEST(_estimate_microcents, 0) + GREATEST(_actual_microcents, 0),
           0
         ),
         updated_at = now()
   WHERE s.month = _month;
END;
$$;

REVOKE ALL ON FUNCTION public.luna_budget_reserve(BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.luna_budget_settle(BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.luna_budget_reserve(BIGINT, BIGINT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.luna_budget_settle(BIGINT, BIGINT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luna_budget_reserve(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.luna_budget_settle(BIGINT, BIGINT) TO service_role;