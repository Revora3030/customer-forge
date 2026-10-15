-- Claiming a Jarvis prospect demo.
--
-- A prospect demo is an is_demo workspace a super-admin built for a business
-- with no website (website_settings.generation.prospectDemo). When the owner
-- opens the private preview link and signs up, this function hands the
-- workspace to them in one transaction:
--   * the claimant becomes the only owner (the operator's membership is removed),
--   * the workspace stops being a demo and starts the standard 3-day full-access trial,
--   * every preview link is revoked so the old shared link stops showing their site,
--   * the marker records who claimed it and when, so it can never be claimed twice.
-- Only the server (service_role) can call it; the caller passes the verified user id.

CREATE OR REPLACE FUNCTION public.claim_prospect_demo_server(
  _token text,
  _user_id uuid,
  _trial_days integer default 3
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_link record;
  v_org uuid;
  v_generation jsonb;
  v_ends timestamptz;
  v_days integer := greatest(1, least(coalesce(_trial_days, 3), 30));
begin
  if _user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from auth.users u where u.id = _user_id) then
    raise exception 'UNKNOWN_USER';
  end if;
  if _token is null or _token !~ '^[A-Za-z0-9_-]{16,120}$' then
    raise exception 'CLAIM_NOT_AVAILABLE';
  end if;

  -- Same lock as provision_workspace_server, so a claim and a normal signup
  -- for one person can never both create a workspace.
  perform pg_advisory_xact_lock(hashtextextended(_user_id::text, 7));

  if exists (select 1 from public.memberships m where m.user_id = _user_id) then
    raise exception 'ALREADY_HAS_WORKSPACE';
  end if;

  select l.organization_id, l.revoked, l.expires_at
    into v_link
  from public.website_preview_links l
  where l.token = _token;
  if not found or v_link.revoked or v_link.expires_at <= now() then
    raise exception 'CLAIM_NOT_AVAILABLE';
  end if;
  v_org := v_link.organization_id;

  perform 1 from public.organizations o where o.id = v_org and o.is_demo for update;
  if not found then
    raise exception 'CLAIM_NOT_AVAILABLE';
  end if;

  select coalesce(ws.generation, '{}'::jsonb) into v_generation
  from public.website_settings ws
  where ws.organization_id = v_org
  for update;
  if v_generation is null
     or v_generation->'prospectDemo'->>'kind' is distinct from 'prospect_demo'
     or v_generation->'prospectDemo'->>'previewToken' is distinct from _token
     or (v_generation->'prospectDemo') ? 'claimedAt' then
    raise exception 'CLAIM_NOT_AVAILABLE';
  end if;

  v_ends := now() + make_interval(days => v_days);

  update public.organizations
     set is_demo = false,
         created_by = _user_id,
         subscription_status = 'trialing',
         trial_ends_at = v_ends,
         updated_at = now()
   where id = v_org;

  delete from public.memberships where organization_id = v_org;
  insert into public.memberships (organization_id, user_id, role)
  values (v_org, _user_id, 'owner');

  insert into public.platform_trials (organization_id, kind, started_by, started_at, trial_ends_at)
  values (v_org, 'free_access', _user_id, now(), v_ends)
  on conflict (organization_id, kind) do nothing;

  update public.website_preview_links
     set revoked = true, updated_at = now()
   where organization_id = v_org;

  update public.website_settings
     set generation = jsonb_set(
           v_generation,
           '{prospectDemo}',
           (v_generation->'prospectDemo')
             || jsonb_build_object('claimedAt', now(), 'claimedBy', _user_id)
         )
   where organization_id = v_org;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  values (v_org, _user_id, 'prospect_demo.claimed', 'organization', v_org::text,
          jsonb_build_object('trial_days', v_days));

  return v_org;
end;
$function$;

REVOKE ALL ON FUNCTION public.claim_prospect_demo_server(text, uuid, integer) FROM public;
REVOKE ALL ON FUNCTION public.claim_prospect_demo_server(text, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_prospect_demo_server(text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_prospect_demo_server(text, uuid, integer) TO service_role;
