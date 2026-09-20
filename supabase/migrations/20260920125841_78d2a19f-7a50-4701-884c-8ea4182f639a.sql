CREATE TABLE IF NOT EXISTS public.ai_provider_runtime (
  provider text PRIMARY KEY,
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  used integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  open_until timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_latency_ms integer,
  rate_limited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_provider_runtime TO service_role;

ALTER TABLE public.ai_provider_runtime ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ai_provider_runtime_touch ON public.ai_provider_runtime;
CREATE TRIGGER ai_provider_runtime_touch
BEFORE UPDATE ON public.ai_provider_runtime
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomically count one free request against today's shared allowance.
-- Returns the requests left for today, or NULL when the provider has no cap.
CREATE OR REPLACE FUNCTION public.ai_note_free_use(_provider text, _cap integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_used integer;
BEGIN
  IF _provider IS NULL OR btrim(_provider) = '' THEN
    RAISE EXCEPTION 'PROVIDER_REQUIRED';
  END IF;

  INSERT INTO public.ai_provider_runtime AS r (provider, day, used)
  VALUES (left(btrim(_provider), 40), v_today, 1)
  ON CONFLICT (provider) DO UPDATE
    SET day = v_today,
        used = CASE WHEN r.day = v_today THEN r.used + 1 ELSE 1 END,
        updated_at = now()
  RETURNING r.used INTO v_used;

  IF _cap IS NULL OR _cap <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN greatest(0, _cap - v_used);
END;
$$;

-- Record the outcome of one provider call and keep the shared circuit state.
CREATE OR REPLACE FUNCTION public.ai_note_provider_result(
  _provider text,
  _ok boolean,
  _latency_ms integer DEFAULT NULL,
  _rate_limited boolean DEFAULT false,
  _failure_threshold integer DEFAULT 3,
  _cooldown_seconds integer DEFAULT 60
)
RETURNS public.ai_provider_runtime
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_row public.ai_provider_runtime;
  v_threshold integer := greatest(1, coalesce(_failure_threshold, 3));
  v_cooldown integer := greatest(1, least(3600, coalesce(_cooldown_seconds, 60)));
BEGIN
  IF _provider IS NULL OR btrim(_provider) = '' THEN
    RAISE EXCEPTION 'PROVIDER_REQUIRED';
  END IF;

  INSERT INTO public.ai_provider_runtime AS r (
    provider, day, failures, open_until, last_success_at, last_failure_at,
    last_latency_ms, rate_limited_at
  )
  VALUES (
    left(btrim(_provider), 40),
    v_today,
    CASE WHEN _ok THEN 0 ELSE 1 END,
    NULL,
    CASE WHEN _ok THEN now() ELSE NULL END,
    CASE WHEN _ok THEN NULL ELSE now() END,
    greatest(0, least(600000, coalesce(_latency_ms, 0))),
    CASE WHEN coalesce(_rate_limited, false) THEN now() ELSE NULL END
  )
  ON CONFLICT (provider) DO UPDATE
    SET failures = CASE
          WHEN _ok THEN 0
          WHEN r.failures + 1 >= v_threshold THEN 0
          ELSE r.failures + 1
        END,
        open_until = CASE
          WHEN _ok THEN NULL
          WHEN r.failures + 1 >= v_threshold THEN now() + make_interval(secs => v_cooldown)
          ELSE r.open_until
        END,
        last_success_at = CASE WHEN _ok THEN now() ELSE r.last_success_at END,
        last_failure_at = CASE WHEN _ok THEN r.last_failure_at ELSE now() END,
        last_latency_ms = coalesce(greatest(0, least(600000, _latency_ms)), r.last_latency_ms),
        rate_limited_at = CASE
          WHEN coalesce(_rate_limited, false) THEN now()
          ELSE r.rate_limited_at
        END,
        updated_at = now()
  RETURNING r.* INTO v_row;

  RETURN v_row;
END;
$$;

-- Current shared picture for the admin AI surface. No secrets involved.
CREATE OR REPLACE FUNCTION public.ai_runtime_snapshot()
RETURNS SETOF public.ai_provider_runtime
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.ai_provider_runtime ORDER BY provider
$$;

REVOKE ALL ON FUNCTION public.ai_note_free_use(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_note_provider_result(text, boolean, integer, boolean, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_runtime_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_note_free_use(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_note_provider_result(text, boolean, integer, boolean, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_runtime_snapshot() TO service_role;