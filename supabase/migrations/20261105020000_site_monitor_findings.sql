-- LOV-3 owner live-site monitor: one row per (site, check). State is
-- new -> seen (owner looked) -> fixed (a later check passed). A problem that
-- comes back after being fixed becomes "new" again.
--
-- Members read their own workspace's rows; only the service role (the
-- scheduled job) writes. Idempotent and non-destructive: IF NOT EXISTS,
-- policies created only when missing, no DROP, no row changes, no pg_cron job.

CREATE TABLE IF NOT EXISTS public.site_monitor_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  host text NOT NULL CHECK (char_length(host) BETWEEN 3 AND 253),
  check_key text NOT NULL CHECK (check_key IN ('home_down', 'https_cert', 'sitemap_missing', 'noindex_live', 'visitor_errors')),
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'seen', 'fixed')),
  title text NOT NULL CHECK (char_length(title) <= 200),
  detail text NOT NULL CHECK (char_length(detail) <= 600),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  fixed_at timestamptz,
  emailed_at timestamptz,
  CONSTRAINT site_monitor_findings_site_check_key UNIQUE (organization_id, host, check_key)
);

CREATE INDEX IF NOT EXISTS site_monitor_findings_open_idx
  ON public.site_monitor_findings (organization_id)
  WHERE state <> 'fixed';

ALTER TABLE public.site_monitor_findings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_monitor_findings FROM PUBLIC;
REVOKE ALL ON public.site_monitor_findings FROM anon;
REVOKE ALL ON public.site_monitor_findings FROM authenticated;
GRANT SELECT ON public.site_monitor_findings TO authenticated;
GRANT ALL ON public.site_monitor_findings TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_monitor_findings'
      AND policyname = 'site_monitor_findings_member_select'
  ) THEN
    CREATE POLICY site_monitor_findings_member_select ON public.site_monitor_findings
      FOR SELECT TO authenticated
      USING (private.is_org_member(organization_id));
  END IF;
END
$$;
