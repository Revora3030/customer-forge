REVOKE ALL ON public.team_invitations FROM anon;
REVOKE ALL ON public.team_invitations FROM authenticated;

GRANT SELECT (
  id,
  organization_id,
  email,
  role,
  invited_by,
  expires_at,
  accepted_at,
  accepted_by,
  revoked_at,
  created_at,
  updated_at
) ON public.team_invitations TO authenticated;

GRANT ALL ON public.team_invitations TO service_role;