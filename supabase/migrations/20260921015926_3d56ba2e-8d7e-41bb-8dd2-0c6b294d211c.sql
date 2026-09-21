CREATE TABLE public.website_branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','kept','discarded')),
  base_snapshot jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  closed_by uuid REFERENCES auth.users(id)
);

CREATE INDEX website_branches_org_idx ON public.website_branches (organization_id, created_at DESC);
CREATE UNIQUE INDEX website_branches_one_open_idx ON public.website_branches (organization_id) WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_branches TO authenticated;
GRANT ALL ON public.website_branches TO service_role;

ALTER TABLE public.website_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_branches_read" ON public.website_branches FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());
CREATE POLICY "website_branches_write" ON public.website_branches FOR INSERT TO authenticated
  WITH CHECK (private.can_manage_org(organization_id) OR private.is_super_admin());
CREATE POLICY "website_branches_update" ON public.website_branches FOR UPDATE TO authenticated
  USING (private.can_manage_org(organization_id) OR private.is_super_admin())
  WITH CHECK (private.can_manage_org(organization_id) OR private.is_super_admin());
CREATE POLICY "website_branches_delete" ON public.website_branches FOR DELETE TO authenticated
  USING (private.can_manage_org(organization_id) OR private.is_super_admin());