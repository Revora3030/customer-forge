CREATE TABLE IF NOT EXISTS public.site_content_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 255),
  url TEXT NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 500),
  reachable BOOLEAN NOT NULL,
  p1_count INT NOT NULL DEFAULT 0 CHECK (p1_count >= 0),
  p2_count INT NOT NULL DEFAULT 0 CHECK (p2_count >= 0),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  audited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_content_audits_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS site_content_audits_org_idx
  ON public.site_content_audits (organization_id, audited_at DESC);
CREATE INDEX IF NOT EXISTS site_content_audits_run_idx
  ON public.site_content_audits (run_id);
ALTER TABLE public.site_content_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_content_audits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_content_audits TO authenticated;
GRANT ALL ON public.site_content_audits TO service_role;
DROP POLICY IF EXISTS "Members read their site's content audits" ON public.site_content_audits;
CREATE POLICY "Members read their site's content audits"
  ON public.site_content_audits FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());