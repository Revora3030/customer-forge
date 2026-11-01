-- Owner-written "Rules for my site": one block of plain-language rules per
-- workspace (words never to use, tone, service area...). Always handed to the
-- AI with every build; the owner can edit or delete it at any time.
-- Additive: new table only, RLS mirrors website_memory.
CREATE TABLE IF NOT EXISTS public.website_rules (
  organization_id UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  rules TEXT NOT NULL CHECK (char_length(rules) BETWEEN 1 AND 2000),
  updated_by UUID REFERENCES auth.users,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_rules TO authenticated;
GRANT ALL ON public.website_rules TO service_role;
ALTER TABLE public.website_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view site rules" ON public.website_rules;
CREATE POLICY "Members can view site rules" ON public.website_rules FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_rules.organization_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS "Managers can add site rules" ON public.website_rules;
CREATE POLICY "Managers can add site rules" ON public.website_rules FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_rules.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));
DROP POLICY IF EXISTS "Managers can edit site rules" ON public.website_rules;
CREATE POLICY "Managers can edit site rules" ON public.website_rules FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_rules.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager'))) WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_rules.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));
DROP POLICY IF EXISTS "Managers can delete site rules" ON public.website_rules;
CREATE POLICY "Managers can delete site rules" ON public.website_rules FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_rules.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));
