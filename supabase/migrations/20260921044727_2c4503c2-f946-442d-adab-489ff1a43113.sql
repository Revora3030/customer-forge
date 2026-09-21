CREATE TABLE public.luna_tenant_budget_state (
  month TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  cap_microcents BIGINT NOT NULL DEFAULT 2000000000 CHECK (cap_microcents >= 0),
  spent_microcents BIGINT NOT NULL DEFAULT 0 CHECK (spent_microcents >= 0),
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, scope_id),
  CONSTRAINT luna_tenant_budget_scope_matches CHECK (
    scope_id = COALESCE(organization_id::TEXT, 'platform')
  )
);

GRANT SELECT ON public.luna_tenant_budget_state TO authenticated;
GRANT ALL ON public.luna_tenant_budget_state TO service_role;

ALTER TABLE public.luna_tenant_budget_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "luna_tenant_budget_state super admin read"
  ON public.luna_tenant_budget_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_accounts pa
      WHERE pa.user_id = auth.uid()
    )
  );

CREATE INDEX luna_tenant_budget_organization_idx
  ON public.luna_tenant_budget_state (organization_id, month DESC)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.luna_budget_reserve_tenant(
  _organization_id UUID,
  _estimate_microcents BIGINT,
  _global_cap_microcents BIGINT,
  _tenant_cap_microcents BIGINT
)
RETURNS TABLE(
  allowed BOOLEAN,
  spent_microcents BIGINT,
  cap_microcents BIGINT,
  calls INTEGER,
  tenant_spent_microcents BIGINT,
  tenant_cap_microcents BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month TEXT := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  _scope_id TEXT := COALESCE(_organization_id::TEXT, 'platform');
  _global_spent BIGINT;
  _global_cap BIGINT;
  _global_calls INTEGER;
  _tenant_spent BIGINT;
  _tenant_cap BIGINT;
  _estimate BIGINT := GREATEST(_estimate_microcents, 0);
BEGIN
  IF _organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = _organization_id
  ) THEN
    RAISE EXCEPTION 'Unknown organization';
  END IF;

  INSERT INTO public.luna_budget_state (month, cap_microcents)
  VALUES (_month, GREATEST(_global_cap_microcents, 0))
  ON CONFLICT (month) DO NOTHING;

  SELECT s.spent_microcents, s.cap_microcents, s.calls
    INTO _global_spent, _global_cap, _global_calls
  FROM public.luna_budget_state s
  WHERE s.month = _month
  FOR UPDATE;

  IF _global_cap <> GREATEST(_global_cap_microcents, 0) THEN
    UPDATE public.luna_budget_state s
       SET cap_microcents = GREATEST(_global_cap_microcents, 0), updated_at = now()
     WHERE s.month = _month
     RETURNING s.cap_microcents INTO _global_cap;
  END IF;

  INSERT INTO public.luna_tenant_budget_state (
    month, scope_id, organization_id, cap_microcents
  ) VALUES (
    _month, _scope_id, _organization_id, GREATEST(_tenant_cap_microcents, 0)
  ) ON CONFLICT (month, scope_id) DO NOTHING;

  SELECT s.spent_microcents, s.cap_microcents
    INTO _tenant_spent, _tenant_cap
  FROM public.luna_tenant_budget_state s
  WHERE s.month = _month AND s.scope_id = _scope_id
  FOR UPDATE;

  IF _tenant_cap <> GREATEST(_tenant_cap_microcents, 0) THEN
    UPDATE public.luna_tenant_budget_state s
       SET cap_microcents = GREATEST(_tenant_cap_microcents, 0), updated_at = now()
     WHERE s.month = _month AND s.scope_id = _scope_id
     RETURNING s.cap_microcents INTO _tenant_cap;
  END IF;

  IF _global_spent + _estimate > _global_cap
     OR _tenant_spent + _estimate > _tenant_cap THEN
    RETURN QUERY SELECT FALSE, _global_spent, _global_cap, _global_calls, _tenant_spent, _tenant_cap;
    RETURN;
  END IF;

  UPDATE public.luna_budget_state s
     SET spent_microcents = s.spent_microcents + _estimate,
         calls = s.calls + 1,
         updated_at = now()
   WHERE s.month = _month
   RETURNING s.spent_microcents, s.cap_microcents, s.calls
        INTO _global_spent, _global_cap, _global_calls;

  UPDATE public.luna_tenant_budget_state s
     SET spent_microcents = s.spent_microcents + _estimate,
         calls = s.calls + 1,
         updated_at = now()
   WHERE s.month = _month AND s.scope_id = _scope_id
   RETURNING s.spent_microcents, s.cap_microcents
        INTO _tenant_spent, _tenant_cap;

  RETURN QUERY SELECT TRUE, _global_spent, _global_cap, _global_calls, _tenant_spent, _tenant_cap;
END;
$$;

CREATE OR REPLACE FUNCTION public.luna_budget_settle_tenant(
  _organization_id UUID,
  _estimate_microcents BIGINT,
  _actual_microcents BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _month TEXT := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  _scope_id TEXT := COALESCE(_organization_id::TEXT, 'platform');
BEGIN
  UPDATE public.luna_budget_state s
     SET spent_microcents = GREATEST(
           s.spent_microcents - GREATEST(_estimate_microcents, 0) + GREATEST(_actual_microcents, 0),
           0
         ),
         updated_at = now()
   WHERE s.month = _month;

  UPDATE public.luna_tenant_budget_state s
     SET spent_microcents = GREATEST(
           s.spent_microcents - GREATEST(_estimate_microcents, 0) + GREATEST(_actual_microcents, 0),
           0
         ),
         updated_at = now()
   WHERE s.month = _month AND s.scope_id = _scope_id;
END;
$$;

REVOKE ALL ON FUNCTION public.luna_budget_reserve_tenant(UUID, BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.luna_budget_settle_tenant(UUID, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luna_budget_reserve_tenant(UUID, BIGINT, BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.luna_budget_settle_tenant(UUID, BIGINT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.luna_budget_reserve(BIGINT, BIGINT) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.luna_budget_settle(BIGINT, BIGINT) FROM service_role;