-- Reconcile security hardening that never reached production.
--
-- A 2026-10-17 read-only audit of the live database found four small pieces of
-- earlier hardening that were written but never applied:
--   20260913160343_security_consolidate_billing_rls      invoices grants
--   20260913230000_revora_10_10_security_performance_hardening
--                    platform_accounts / platform_trials lock-down and two
--                    duplicate indexes
--   20260919210000_harden_private_security_definer_execute
--                    PUBLIC EXECUTE on private trigger / definer helpers
--   20260927203100_add_lead_webhook_url    lead_webhook_url length CHECK
-- Rather than replaying those files, exactly the missing statements are
-- carried forward here.
--
-- Contract: additive or revoke-only, idempotent, no data change. Nothing here
-- grants a privilege to anon or authenticated, loosens RLS, drops a table or
-- deletes a row. Every step is guarded so a replay or a partly reconciled
-- database is a no-op. The application reads and writes billing and platform
-- tables only as service_role (supabaseAdmin), which none of this touches.
--
-- Deliberately NOT included: REVOKE USAGE ON SCHEMA private FROM anon,
-- authenticated. RLS policies across the schema call private.is_org_member,
-- private.is_super_admin, private.org_site_published and others with the
-- querying role's privileges, so removing schema USAGE would make every such
-- policy fail with "permission denied for schema private" and take down tenant
-- and public-site reads. The per-function EXECUTE revokes below are safe
-- because those helpers are only reached from triggers and SECURITY DEFINER
-- functions.
--
-- Not applied automatically: the owner applies this off-peak.

-- ---------------------------------------------------------------------------
-- (a) invoices: browser roles may not write or truncate billing records.
--     authenticated keeps SELECT (invoices_member_read policy); writes are
--     service_role only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices FROM authenticated;

-- ---------------------------------------------------------------------------
-- (b) platform_accounts / platform_trials: control-plane tables.
--     Restrictive deny policies for every write command, so no permissive
--     policy added later can open a browser write path. SELECT is left to the
--     existing *_admin_read policies (super admins only). RLS has been enabled
--     on both tables since they were created.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_accounts_deny_client_insert ON public.platform_accounts;
CREATE POLICY platform_accounts_deny_client_insert
  ON public.platform_accounts
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS platform_accounts_deny_client_update ON public.platform_accounts;
CREATE POLICY platform_accounts_deny_client_update
  ON public.platform_accounts
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS platform_accounts_deny_client_delete ON public.platform_accounts;
CREATE POLICY platform_accounts_deny_client_delete
  ON public.platform_accounts
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS platform_trials_deny_client_insert ON public.platform_trials;
CREATE POLICY platform_trials_deny_client_insert
  ON public.platform_trials
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS platform_trials_deny_client_update ON public.platform_trials;
CREATE POLICY platform_trials_deny_client_update
  ON public.platform_trials
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS platform_trials_deny_client_delete ON public.platform_trials;
CREATE POLICY platform_trials_deny_client_delete
  ON public.platform_trials
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

REVOKE TRUNCATE, INSERT, UPDATE, DELETE ON public.platform_accounts FROM anon, authenticated;
REVOKE TRUNCATE, INSERT, UPDATE, DELETE ON public.platform_trials FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- (c) Exact duplicate indexes. Each is dropped only when its twin exists, so
--     the lookup it serves is never left without an index.
--       leads_org_recent_idx              = leads_org_created_idx
--       payment_events_provider_event_idx = payment_events_provider_event_uniq
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.leads_org_created_idx') IS NOT NULL THEN
    EXECUTE 'DROP INDEX IF EXISTS public.leads_org_recent_idx';
  ELSE
    RAISE NOTICE 'leads_org_created_idx missing; keeping leads_org_recent_idx';
  END IF;

  IF to_regclass('public.payment_events_provider_event_uniq') IS NOT NULL THEN
    EXECUTE 'DROP INDEX IF EXISTS public.payment_events_provider_event_idx';
  ELSE
    RAISE NOTICE 'payment_events_provider_event_uniq missing; keeping payment_events_provider_event_idx';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- (d) private helpers: no PUBLIC EXECUTE. Signatures as in 20260919210000.
--     production_unlocked(uuid) is only called by SECURITY DEFINER
--     site_live_allowed and the guard_production_activation trigger; the other
--     three are trigger functions. Trigger firing does not check EXECUTE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'private.production_unlocked(uuid)',
    'private.protect_org_billing_columns()',
    'private.default_org_billing_columns()',
    'private.freeze_organization_id()'
  ]
  LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    ELSE
      RAISE NOTICE 'skipping absent function %', sig;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- (e) lead_webhook_url length bound (same rule as 20260927203100). NOT VALID
--     so adding it takes no scan; every live value is NULL today.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.website_settings') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'website_settings'
         AND column_name = 'lead_webhook_url'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'website_settings_lead_webhook_url_length'
         AND conrelid = 'public.website_settings'::regclass
     ) THEN
    EXECUTE 'ALTER TABLE public.website_settings
      ADD CONSTRAINT website_settings_lead_webhook_url_length
      CHECK (lead_webhook_url IS NULL OR char_length(lead_webhook_url) <= 2048) NOT VALID';
  END IF;
END
$$;

-- Read-only verification after apply:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('invoices', 'platform_accounts', 'platform_trials')
--      and grantee in ('anon', 'authenticated');
--   select tablename, policyname, permissive, cmd from pg_policies
--    where tablename in ('platform_accounts', 'platform_trials');
--   select to_regclass('public.leads_org_recent_idx'),
--          to_regclass('public.payment_events_provider_event_idx');
--   select proacl from pg_proc where oid = 'private.production_unlocked(uuid)'::regprocedure;
--   select conname, convalidated from pg_constraint
--    where conname = 'website_settings_lead_webhook_url_length';
--
-- Rollback (only after review): the revokes and policies are reversed by the
-- matching GRANT / DROP POLICY; the indexes by re-running their original
-- CREATE INDEX; the constraint by ALTER TABLE ... DROP CONSTRAINT.
