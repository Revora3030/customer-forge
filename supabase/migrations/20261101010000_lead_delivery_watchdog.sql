-- Lead-delivery watchdog: confirm that every lead's owner alert email actually
-- went out, retry when it did not, flag it for the owner and /admin, and log it.
--
-- Builds on lead_alert_log (one row per alert attempt, written by the submit
-- path and by lead-alert-retry). "sent" there means the email provider
-- accepted the message; the provider API gives no inbox-delivery receipt, so
-- that is the strongest confirmation this system has.
--
-- 1. lead_delivery_watch: one row per lead that needed attention (no accepted
--    alert after the grace period). Owners read their own rows (RLS) to show a
--    banner on the dashboard; only the service role writes.
-- 2. lead_watchdog_events: append-only log of everything the watchdog did,
--    plus one 'run' heartbeat per pass so /admin can tell if the watchdog
--    itself stopped. Rows with a workspace are readable by that workspace's
--    members; heartbeat rows (no workspace) are service-role only.
-- 3. pg_cron schedule through public.call_revora_job every 5 minutes, same
--    guards as 20261030120000_customer_jobs_schedule.sql: does nothing where
--    pg_cron or call_revora_job is missing, and re-running reschedules in place.

CREATE TABLE IF NOT EXISTS public.lead_delivery_watch (
  lead_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  problem text NOT NULL CHECK (problem IN (
    'never_attempted', 'failed_retrying', 'failed_permanent', 'no_alert_inbox', 'exhausted'
  )),
  reason text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_flagged_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  owner_notified_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_delivery_watch_org_state_idx
  ON public.lead_delivery_watch (organization_id, state, first_flagged_at DESC);
CREATE INDEX IF NOT EXISTS lead_delivery_watch_open_idx
  ON public.lead_delivery_watch (state, first_flagged_at DESC) WHERE state = 'open';

GRANT SELECT ON public.lead_delivery_watch TO authenticated;
GRANT ALL ON public.lead_delivery_watch TO service_role;
ALTER TABLE public.lead_delivery_watch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_delivery_watch_member_read ON public.lead_delivery_watch;
CREATE POLICY lead_delivery_watch_member_read ON public.lead_delivery_watch
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.lead_watchdog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid,
  event text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_watchdog_events_created_idx
  ON public.lead_watchdog_events (created_at DESC);
CREATE INDEX IF NOT EXISTS lead_watchdog_events_org_idx
  ON public.lead_watchdog_events (organization_id, created_at DESC);

GRANT SELECT ON public.lead_watchdog_events TO authenticated;
GRANT ALL ON public.lead_watchdog_events TO service_role;
ALTER TABLE public.lead_watchdog_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_watchdog_events_member_read ON public.lead_watchdog_events;
CREATE POLICY lead_watchdog_events_member_read ON public.lead_watchdog_events
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND private.is_org_member(organization_id));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; lead delivery watchdog schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; lead delivery watchdog schedule was not changed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'revora-lead-delivery-watchdog',
    '*/5 * * * *',
    $cmd$select public.call_revora_job('lead-delivery-watchdog', 600000)$cmd$
  );
END $$;
