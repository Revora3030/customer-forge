-- COMP-4 post-publish health: the latest measured outcome of each LOV-3
-- site-monitor check (pass / fail / not_verified) per site, so the owner card
-- can show passes too, not only open problems. Written only by the scheduled
-- site-monitor job (service role) when SITE_MONITOR_MODE=on.
-- Additive and idempotent: IF NOT EXISTS, policy created only when missing,
-- no DROP, no row changes, no pg_cron job.

CREATE TABLE IF NOT EXISTS public.site_monitor_checks (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  host text NOT NULL CHECK (char_length(host) BETWEEN 3 AND 253),
  check_key text NOT NULL CHECK (check_key IN ('home_down', 'https_cert', 'sitemap_missing', 'noindex_live', 'visitor_errors')),
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'not_verified')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, host, check_key)
);

ALTER TABLE public.site_monitor_checks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_monitor_checks FROM PUBLIC;
REVOKE ALL ON public.site_monitor_checks FROM anon;
REVOKE ALL ON public.site_monitor_checks FROM authenticated;
GRANT SELECT ON public.site_monitor_checks TO authenticated;
GRANT ALL ON public.site_monitor_checks TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_monitor_checks'
      AND policyname = 'site_monitor_checks_member_select'
  ) THEN
    CREATE POLICY site_monitor_checks_member_select ON public.site_monitor_checks
      FOR SELECT TO authenticated
      USING (private.is_org_member(organization_id));
  END IF;
END
$$;
