-- Cross-tenant hardening (found by the cross-tenant regression suite).
--
-- "luna_tenant_budget_state super admin read" was meant for platform super
-- admins, but its predicate admitted ANY signed-in account that has a
-- platform_accounts row (every customer gets one at sign-up):
--
--   EXISTS (SELECT 1 FROM platform_accounts pa WHERE pa.user_id = auth.uid())
--
-- The table holds every workspace's monthly AI spend, cap and call count. It is
-- not readable today only because platform_accounts carries its own restrictive
-- deny-all policy, so the subquery returns no rows for browser sessions. That is
-- one unrelated policy away from letting every customer read every other
-- customer's AI usage.
--
-- Make the policy say what its name says. No application code reads this table
-- with a user session (the budget RPCs run with the service role), so nothing
-- changes for customers or for the platform.
DROP POLICY IF EXISTS "luna_tenant_budget_state super admin read" ON public.luna_tenant_budget_state;

CREATE POLICY "luna_tenant_budget_state super admin read"
  ON public.luna_tenant_budget_state
  FOR SELECT TO authenticated
  USING (private.is_super_admin());
