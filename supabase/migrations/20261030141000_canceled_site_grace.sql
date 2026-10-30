-- Canceled customer sites go offline after a 14-day grace period.
--
-- When a live subscription is canceled (or Stripe cancels it after failed
-- payments) and its paid period has ended, the site stays online for 14 more
-- days. The owner is emailed at cancel time and 3 days before it goes offline.
-- After the grace period the public site answers with a neutral
-- "This site is currently unavailable" page (410 + noindex) and drops out of
-- every sitemap. Resubscribing deletes the row and the site is back at once.
-- Nothing is deleted from the site itself. Demo and Revora-owned workspaces
-- are never tracked here.
--
-- A separate table (not organizations columns) so workspace members can read
-- their own row but only the service role can change it.
CREATE TABLE IF NOT EXISTS public.site_hosting_grace (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_subscription_id text,
  ended_at timestamptz NOT NULL,
  offline_after timestamptz NOT NULL,
  warning_sent_at timestamptz,
  offline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_hosting_grace_offline_idx
  ON public.site_hosting_grace (offline_at)
  WHERE offline_at IS NOT NULL;

GRANT SELECT ON public.site_hosting_grace TO authenticated;
GRANT ALL ON public.site_hosting_grace TO service_role;

ALTER TABLE public.site_hosting_grace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_hosting_grace_member_read" ON public.site_hosting_grace;
CREATE POLICY "site_hosting_grace_member_read" ON public.site_hosting_grace
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.organization_id = site_hosting_grace.organization_id
    AND m.user_id = auth.uid()
));

-- Hourly sweep through the same public.call_revora_job path as
-- 20261030120000_customer_jobs_schedule.sql. Does nothing where pg_cron or
-- call_revora_job is missing; re-running reschedules in place.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed; the site-hosting schedule was not changed.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'call_revora_job'
  ) THEN
    RAISE NOTICE 'public.call_revora_job is missing; the site-hosting schedule was not changed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'revora-site-hosting',
    '50 * * * *',
    $cmd$select public.call_revora_job('site-hosting', 900000)$cmd$
  );
END $$;
