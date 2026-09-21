DROP POLICY IF EXISTS "luna_budget_state super admin read" ON public.luna_budget_state;
CREATE POLICY "luna_budget_state super admin read"
  ON public.luna_budget_state
  FOR SELECT
  TO authenticated
  USING (private.is_super_admin());

DROP POLICY IF EXISTS "luna_usage_events super admin read" ON public.luna_usage_events;
CREATE POLICY "luna_usage_events super admin read"
  ON public.luna_usage_events
  FOR SELECT
  TO authenticated
  USING (private.is_super_admin());