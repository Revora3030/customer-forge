CREATE TABLE public.website_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rule','decision','outcome','avoid')),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 400),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX website_memory_org_recent ON public.website_memory (organization_id, created_at DESC);
CREATE UNIQUE INDEX website_memory_org_kind_text ON public.website_memory (organization_id, kind, lower(text));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_memory TO authenticated;
GRANT ALL ON public.website_memory TO service_role;
ALTER TABLE public.website_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view workspace memory" ON public.website_memory FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_memory.organization_id AND m.user_id = auth.uid()));
CREATE POLICY "Managers can add workspace memory" ON public.website_memory FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_memory.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));
CREATE POLICY "Managers can pin workspace memory" ON public.website_memory FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_memory.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager'))) WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_memory.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));
CREATE POLICY "Managers can forget workspace memory" ON public.website_memory FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = website_memory.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin','manager')));