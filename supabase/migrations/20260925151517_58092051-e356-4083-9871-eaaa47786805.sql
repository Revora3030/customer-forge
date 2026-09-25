CREATE TABLE public.builder_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) <= 20000),
  plan jsonb,
  restore_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_messages_org_created_idx ON public.builder_messages (organization_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.builder_messages TO authenticated;
GRANT ALL ON public.builder_messages TO service_role;
ALTER TABLE public.builder_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY builder_messages_select ON public.builder_messages FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());
CREATE POLICY builder_messages_insert ON public.builder_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.can_manage_org(organization_id));
CREATE POLICY builder_messages_delete ON public.builder_messages FOR DELETE TO authenticated
  USING (private.can_manage_org(organization_id) OR private.is_super_admin());