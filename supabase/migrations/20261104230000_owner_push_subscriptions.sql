-- Web Push (VAPID) subscriptions for owner speed-to-lead alerts.
--
-- One row per browser/device push subscription. A dashboard member can only
-- see, add, update or remove their OWN subscriptions inside an organization
-- they belong to (private.is_org_member). The service role reads them to send
-- a push when a new lead lands; it also disables endpoints the push service
-- reports as gone (404/410).
--
-- Idempotent and non-destructive: IF NOT EXISTS everywhere, policies are only
-- created when missing, no DROP, no row changes, no pg_cron job.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (endpoint ~ '^https://' AND length(endpoint) <= 2048),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 40 AND 200),
  auth text NOT NULL CHECK (length(auth) BETWEEN 8 AND 64),
  user_agent text CHECK (user_agent IS NULL OR length(user_agent) <= 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  disabled_at timestamptz,
  CONSTRAINT push_subscriptions_org_endpoint_key UNIQUE (organization_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_org_active_idx
  ON public.push_subscriptions (organization_id)
  WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON public.push_subscriptions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.push_subscriptions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_own_select'
  ) THEN
    CREATE POLICY push_subscriptions_own_select ON public.push_subscriptions
      FOR SELECT TO authenticated
      USING (user_id = (SELECT auth.uid()) AND private.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_own_insert'
  ) THEN
    CREATE POLICY push_subscriptions_own_insert ON public.push_subscriptions
      FOR INSERT TO authenticated
      WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_own_update'
  ) THEN
    CREATE POLICY push_subscriptions_own_update ON public.push_subscriptions
      FOR UPDATE TO authenticated
      USING (user_id = (SELECT auth.uid()) AND private.is_org_member(organization_id))
      WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
      AND policyname = 'push_subscriptions_own_delete'
  ) THEN
    CREATE POLICY push_subscriptions_own_delete ON public.push_subscriptions
      FOR DELETE TO authenticated
      USING (user_id = (SELECT auth.uid()) AND private.is_org_member(organization_id));
  END IF;
END $$;
