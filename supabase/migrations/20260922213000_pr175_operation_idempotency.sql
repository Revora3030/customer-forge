CREATE TABLE public.ai_operation_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  completed_at timestamptz,
  UNIQUE (organization_id, operation_key)
);

CREATE INDEX ai_operation_claims_org_idx
  ON public.ai_operation_claims (organization_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.ai_operation_claims TO authenticated;
GRANT ALL ON public.ai_operation_claims TO service_role;

ALTER TABLE public.ai_operation_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_operation_claims_read"
ON public.ai_operation_claims
FOR SELECT TO authenticated
USING (private.is_org_member(organization_id) OR private.is_super_admin());

CREATE POLICY "ai_operation_claims_write"
ON public.ai_operation_claims
FOR INSERT TO authenticated
WITH CHECK (private.can_manage_org(organization_id) OR private.is_super_admin());

CREATE POLICY "ai_operation_claims_update"
ON public.ai_operation_claims
FOR UPDATE TO authenticated
USING (private.can_manage_org(organization_id) OR private.is_super_admin())
WITH CHECK (private.can_manage_org(organization_id) OR private.is_super_admin());

CREATE TRIGGER ai_operation_claims_touch
BEFORE UPDATE ON public.ai_operation_claims
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
