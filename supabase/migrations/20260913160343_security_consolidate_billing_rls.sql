-- ============================================================================
-- SECURITY CONSOLIDATION — BILLING RLS (subscriptions / payments / invoices)
-- ============================================================================
--
-- Purpose
-- -------
-- One authoritative, idempotent migration for the billing-trust boundary.
--
-- Billing rows are the source of paid entitlement. Normal organization members
-- may READ their own org's billing rows; only trusted server paths (verified
-- Stripe/PayPal webhooks running as service_role, or a super-admin server
-- function) may INSERT / UPDATE / DELETE them.
--
-- The browser/client can never manufacture paid access because:
--   1. Table grants are SELECT-only for `authenticated` (writes need
--      service_role, which the browser never holds).
--   2. RESTRICTIVE RLS policies deny every INSERT/UPDATE/DELETE on these tables
--      for `authenticated` and `anon`, so even a future accidental grant cannot
--      reopen member self-service writes.
--   3. The historical `subscriptions_member_all` ALL-policy is explicitly
--      dropped by name here, so the final applied state can never contain it.
--
-- This migration is safe to apply more than once and against any database,
-- fresh or existing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Subscriptions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_member_all ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_member_read ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_member_write ON public.subscriptions;

REVOKE ALL ON public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- Belt-and-braces: RESTRICTIVE write-deny policies. They are ANDed with any
-- permissive policy of the same command, so a future `GRANT` or an accidental
-- permissive policy cannot let a member write a billing row.
DROP POLICY IF EXISTS subscriptions_no_member_insert ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_no_member_update ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_no_member_delete ON public.subscriptions;

CREATE POLICY subscriptions_no_member_insert ON public.subscriptions
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY subscriptions_no_member_update ON public.subscriptions
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY subscriptions_no_member_delete ON public.subscriptions
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- ---------------------------------------------------------------------------
-- 2. Payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payments_member_all ON public.payments;
DROP POLICY IF EXISTS payments_no_member_writes ON public.payments;

REVOKE ALL ON public.payments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payments FROM authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

DROP POLICY IF EXISTS payments_no_member_insert ON public.payments;
DROP POLICY IF EXISTS payments_no_member_update ON public.payments;
DROP POLICY IF EXISTS payments_no_member_delete ON public.payments;

CREATE POLICY payments_no_member_insert ON public.payments
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY payments_no_member_update ON public.payments
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY payments_no_member_delete ON public.payments
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- ---------------------------------------------------------------------------
-- 3. Invoices
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS invoices_member_all ON public.invoices;
DROP POLICY IF EXISTS invoices_member_read_only ON public.invoices;
DROP POLICY IF EXISTS invoices_no_member_write ON public.invoices;

REVOKE ALL ON public.invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices FROM authenticated;
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

DROP POLICY IF EXISTS invoices_no_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_no_update ON public.invoices;
DROP POLICY IF EXISTS invoices_no_delete ON public.invoices;

CREATE POLICY invoices_no_insert ON public.invoices
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY invoices_no_update ON public.invoices
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY invoices_no_delete ON public.invoices
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- ---------------------------------------------------------------------------
-- 4. Member SELECT paths (permissive, scoped to the caller's org)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS subscriptions_member_read ON public.subscriptions;
CREATE POLICY subscriptions_member_read ON public.subscriptions
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS invoices_member_read ON public.invoices;
CREATE POLICY invoices_member_read ON public.invoices
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

-- Payments restore path was a SELECT-only member policy in the original even
-- without a dropped ALL; keep the member read path explicit and org-scoped.
DROP POLICY IF EXISTS payments_member_read ON public.payments;
CREATE POLICY payments_member_read ON public.payments
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());