-- Per-workspace signing secret for outbound lead webhooks. Every delivery is
-- signed with HMAC-SHA256 so the receiver can prove a lead came from Revora.
--
-- The secret lives in its own table, not website_settings, so no column grant
-- or public view can ever expose it. Managers of the workspace can read and
-- set it; nobody else (including anon and plain members) can see it.
CREATE TABLE IF NOT EXISTS public.lead_webhook_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  secret text NOT NULL CHECK (secret ~ '^whsec_[0-9a-f]{48}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_webhook_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_webhook_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_webhook_secrets TO authenticated;
GRANT ALL ON public.lead_webhook_secrets TO service_role;

DROP POLICY IF EXISTS lead_webhook_secrets_manager_read ON public.lead_webhook_secrets;
CREATE POLICY lead_webhook_secrets_manager_read ON public.lead_webhook_secrets
  FOR SELECT TO authenticated
  USING (private.org_role_at_least(organization_id, 'manager'));

DROP POLICY IF EXISTS lead_webhook_secrets_manager_insert ON public.lead_webhook_secrets;
CREATE POLICY lead_webhook_secrets_manager_insert ON public.lead_webhook_secrets
  FOR INSERT TO authenticated
  WITH CHECK (private.org_role_at_least(organization_id, 'manager'));

DROP POLICY IF EXISTS lead_webhook_secrets_manager_update ON public.lead_webhook_secrets;
CREATE POLICY lead_webhook_secrets_manager_update ON public.lead_webhook_secrets
  FOR UPDATE TO authenticated
  USING (private.org_role_at_least(organization_id, 'manager'))
  WITH CHECK (private.org_role_at_least(organization_id, 'manager'));
