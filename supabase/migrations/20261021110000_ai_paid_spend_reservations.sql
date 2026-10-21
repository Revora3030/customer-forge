-- Daily paid AI cap: one row per reservation, so leaked reservations expire.
--
-- ai_paid_budget_reserve added an estimate to a single per-day counter and
-- ai_paid_budget_settle subtracted it again. A reservation whose settle never
-- landed (a fire-and-forget settle cut off with the worker, a settle RPC that
-- returned an error nobody read, a worker that died mid-call) stayed in the
-- counter for the rest of the UTC day and blocked paid calls early.
--
-- Now every reservation is a row. Today's committed spend is the settled real
-- cost (ai_paid_daily_budget.settled_microcents) plus the reservations still
-- open AND younger than the stale window. A reservation settles once, so the
-- client can retry a settle safely. Both functions lock the day row first,
-- so concurrent reservations serialise and cannot overshoot the cap.
--
-- Additive: the legacy functions keep their signatures and also maintain
-- settled_microcents, so a worker still running the old code during rollout
-- stays counted (conservatively) by the new cap check.

CREATE TABLE IF NOT EXISTS public.ai_paid_spend_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL,
  estimate_microcents BIGINT NOT NULL CHECK (estimate_microcents >= 0),
  actual_microcents BIGINT CHECK (actual_microcents IS NULL OR actual_microcents >= 0),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('settled', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

-- The cap check sums only today's open reservations.
CREATE INDEX IF NOT EXISTS ai_paid_spend_reservations_open_idx
  ON public.ai_paid_spend_reservations (day, created_at)
  WHERE settled_at IS NULL;

ALTER TABLE public.ai_paid_spend_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_paid_spend_reservations FROM PUBLIC, anon, authenticated;

ALTER TABLE public.ai_paid_daily_budget
  ADD COLUMN IF NOT EXISTS settled_microcents BIGINT NOT NULL DEFAULT 0;

-- Existing days carry their legacy counter (leaks included) as settled spend:
-- conservative for the day this lands, exact from the next UTC day on.
UPDATE public.ai_paid_daily_budget
   SET settled_microcents = spent_microcents
 WHERE settled_microcents = 0 AND spent_microcents > 0;

CREATE OR REPLACE FUNCTION public.ai_paid_budget_reserve_tracked(
  _estimate_microcents BIGINT,
  _cap_microcents BIGINT,
  _stale_after_seconds INTEGER DEFAULT 900
)
RETURNS TABLE(allowed BOOLEAN, reservation_id UUID, day DATE, committed_microcents BIGINT, cap_microcents BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _day DATE := (now() AT TIME ZONE 'utc')::date;
  _estimate BIGINT := GREATEST(COALESCE(_estimate_microcents, 0), 0);
  _cap BIGINT := GREATEST(COALESCE(_cap_microcents, 0), 0);
  -- Never shorter than ten minutes: the longest paid call must keep its hold.
  _stale INTERVAL := make_interval(secs => GREATEST(COALESCE(_stale_after_seconds, 900), 600));
  _settled BIGINT;
  _open BIGINT;
  _id UUID;
BEGIN
  INSERT INTO public.ai_paid_daily_budget AS b (day, cap_microcents)
  VALUES (_day, _cap)
  ON CONFLICT ON CONSTRAINT ai_paid_daily_budget_pkey DO UPDATE SET cap_microcents = _cap, updated_at = now();

  -- Day row lock first (same order as the settle), then the open sum.
  SELECT b.settled_microcents INTO _settled
  FROM public.ai_paid_daily_budget b
  WHERE b.day = _day
  FOR UPDATE;

  SELECT COALESCE(SUM(r.estimate_microcents), 0)::BIGINT INTO _open
  FROM public.ai_paid_spend_reservations r
  WHERE r.day = _day
    AND r.settled_at IS NULL
    AND r.created_at > clock_timestamp() - _stale;

  IF _cap = 0 OR _settled + _open + _estimate > _cap THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, _day, _settled + _open, _cap;
    RETURN;
  END IF;

  INSERT INTO public.ai_paid_spend_reservations (day, estimate_microcents, created_at)
  VALUES (_day, _estimate, clock_timestamp())
  RETURNING id INTO _id;

  UPDATE public.ai_paid_daily_budget b
     SET calls = b.calls + 1,
         updated_at = now()
   WHERE b.day = _day;

  RETURN QUERY SELECT TRUE, _id, _day, _settled + _open + _estimate, _cap;
END;
$$;

-- Settles one reservation to its real cost (0 releases it). Returns FALSE when
-- the reservation is unknown or already settled, so a retry never double-counts.
-- A stale reservation still settles: real spend is always counted.
CREATE OR REPLACE FUNCTION public.ai_paid_budget_settle_tracked(
  _reservation_id UUID,
  _actual_microcents BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _day DATE;
  _actual BIGINT := GREATEST(COALESCE(_actual_microcents, 0), 0);
BEGIN
  SELECT r.day INTO _day
  FROM public.ai_paid_spend_reservations r
  WHERE r.id = _reservation_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM public.ai_paid_daily_budget b WHERE b.day = _day FOR UPDATE;

  UPDATE public.ai_paid_spend_reservations r
     SET settled_at = clock_timestamp(),
         actual_microcents = _actual,
         outcome = CASE WHEN _actual > 0 THEN 'settled' ELSE 'released' END
   WHERE r.id = _reservation_id
     AND r.settled_at IS NULL;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.ai_paid_daily_budget b
     SET settled_microcents = b.settled_microcents + _actual,
         spent_microcents = b.spent_microcents + _actual,
         updated_at = now()
   WHERE b.day = _day;
  RETURN TRUE;
END;
$$;

-- Legacy entry points (old workers during rollout): same signatures and the
-- same writes to spent_microcents, with the delta mirrored into
-- settled_microcents. The legacy reserve checks the cap exactly as the
-- tracked one does (settled + open non-stale tracked reservations + this
-- estimate, under the day row lock), so a mix of old and new workers cannot
-- together overshoot the cap.
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
  -- Old workers pass no stale window; they get the tracked default.
  _stale INTERVAL := make_interval(secs => 900);
  _spent BIGINT;
  _settled BIGINT;
  _open BIGINT;
BEGIN
  INSERT INTO public.ai_paid_daily_budget AS b (day, cap_microcents)
  VALUES (_day, _cap)
  ON CONFLICT ON CONSTRAINT ai_paid_daily_budget_pkey DO UPDATE SET cap_microcents = _cap, updated_at = now();

  -- Day row lock first (same order as the tracked reserve and settle).
  SELECT b.spent_microcents, b.settled_microcents INTO _spent, _settled
  FROM public.ai_paid_daily_budget b
  WHERE b.day = _day
  FOR UPDATE;

  SELECT COALESCE(SUM(r.estimate_microcents), 0)::BIGINT INTO _open
  FROM public.ai_paid_spend_reservations r
  WHERE r.day = _day
    AND r.settled_at IS NULL
    AND r.created_at > clock_timestamp() - _stale;

  IF _cap = 0 OR _settled + _open + _estimate > _cap THEN
    RETURN QUERY SELECT FALSE, _day, _spent, _cap;
    RETURN;
  END IF;

  UPDATE public.ai_paid_daily_budget b
     SET spent_microcents = b.spent_microcents + _estimate,
         settled_microcents = b.settled_microcents + _estimate,
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
DECLARE
  _delta BIGINT := GREATEST(COALESCE(_actual_microcents, 0), 0) - GREATEST(COALESCE(_estimate_microcents, 0), 0);
BEGIN
  UPDATE public.ai_paid_daily_budget b
     SET spent_microcents = GREATEST(b.spent_microcents + _delta, 0),
         settled_microcents = GREATEST(b.settled_microcents + _delta, 0),
         updated_at = now()
   WHERE b.day = _day;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_paid_budget_reserve_tracked(BIGINT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_paid_budget_settle_tracked(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_paid_budget_settle(DATE, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_paid_budget_reserve_tracked(BIGINT, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_paid_budget_settle_tracked(UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_paid_budget_settle(DATE, BIGINT, BIGINT) TO service_role;
