-- Owner-written "Rules for my site": one block of plain-language rules per
-- workspace (words never to use, tone, service area...). Always handed to the
-- AI with every build; the owner can edit or delete it at any time.
-- Additive: new table only. RLS uses the private org helpers (same roles as website_memory).
CREATE TABLE IF NOT EXISTS public.website_rules (
  organization_id UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  rules TEXT NOT NULL CHECK (char_length(rules) BETWEEN 1 AND 2000),
  updated_by UUID REFERENCES auth.users,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_rules TO authenticated;
GRANT ALL ON public.website_rules TO service_role;
ALTER TABLE public.website_rules ENABLE ROW LEVEL SECURITY;
-- Policies: members read; owner/admin/manager write (org_role_at_least 'manager').
-- Each one is created only if missing, so re-running this file is a no-op and
-- nothing is ever dropped.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'website_rules' AND policyname = 'Members can view site rules') THEN
    CREATE POLICY "Members can view site rules" ON public.website_rules FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'website_rules' AND policyname = 'Managers can add site rules') THEN
    CREATE POLICY "Managers can add site rules" ON public.website_rules FOR INSERT TO authenticated WITH CHECK (private.org_role_at_least(organization_id, 'manager'));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'website_rules' AND policyname = 'Managers can edit site rules') THEN
    CREATE POLICY "Managers can edit site rules" ON public.website_rules FOR UPDATE TO authenticated USING (private.org_role_at_least(organization_id, 'manager')) WITH CHECK (private.org_role_at_least(organization_id, 'manager'));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'website_rules' AND policyname = 'Managers can delete site rules') THEN
    CREATE POLICY "Managers can delete site rules" ON public.website_rules FOR DELETE TO authenticated USING (private.org_role_at_least(organization_id, 'manager'));
  END IF;
END $$;
