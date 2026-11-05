-- COMP-9: reusable trade starter snapshots (additive only: one new table, one
-- index; nothing existing is altered, dropped or renamed).
--
-- A snapshot is a finished site in one trade with every business-specific fact
-- already removed (name, phone, email, address, city, hours, images, links,
-- reviews, prices). The scrubbing and its leak check run in application code
-- (src/lib/builder/trade-snapshot.ts) BEFORE a row is written, so this table
-- holds tokens such as {{business_name}}, never a real customer's details.
--
-- Platform-admin only: super admins may read it; every write goes through the
-- service role from the admin server functions (which check super_admin first).

CREATE TABLE IF NOT EXISTS public.site_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade text NOT NULL CHECK (length(trade) BETWEEN 1 AND 60),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  snapshot jsonb NOT NULL CHECK (pg_column_size(snapshot) <= 524288),
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  section_count integer NOT NULL DEFAULT 0 CHECK (section_count >= 0),
  -- Where it came from, for the admin only. The source site may be deleted later.
  source_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade, name)
);

CREATE INDEX IF NOT EXISTS site_snapshots_trade_idx ON public.site_snapshots (trade, created_at DESC);
CREATE INDEX IF NOT EXISTS site_snapshots_source_org_idx
  ON public.site_snapshots (source_organization_id) WHERE source_organization_id IS NOT NULL;

ALTER TABLE public.site_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_snapshots TO authenticated;
GRANT ALL ON public.site_snapshots TO service_role;

CREATE POLICY site_snapshots_super_admin_read ON public.site_snapshots
  FOR SELECT TO authenticated
  USING (private.is_super_admin());
