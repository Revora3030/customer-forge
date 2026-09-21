-- Full-access trial window narrowed from 3 days to 1 day.
-- Non-destructive: existing workspaces keep their current trial_ends_at.

ALTER TABLE public.organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '1 day');

-- Client-side inserts get the system-owned trial window.
CREATE OR REPLACE FUNCTION private.default_org_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR private.is_super_admin() THEN
    RETURN NEW;
  END IF;
  NEW.subscription_status := 'trialing';
  NEW.trial_ends_at := now() + interval '1 day';
  NEW.is_demo := false;
  NEW.is_suspended := false;
  NEW.setup_paid_at := NULL;
  NEW.setup_checkout_session_id := NULL;
  NEW.setup_payment_status := 'unpaid';
  RETURN NEW;
END;
$$;

-- Server provisioning entry point: clamp the trial to the 1-day maximum.
CREATE OR REPLACE FUNCTION public.provision_workspace_server(
  _user_id uuid,
  _name text,
  _industry text DEFAULT NULL,
  _profile jsonb DEFAULT '{}'::jsonb,
  _trial_days integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user uuid := _user_id;
  v_org uuid;
  v_slug text;
  v_base text;
  v_ends timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_user) then
    raise exception 'UNKNOWN_USER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 7));

  select m.organization_id into v_org
  from public.memberships m
  where m.user_id = v_user
  order by m.created_at
  limit 1;

  if v_org is null then
    v_base := nullif(regexp_replace(lower(coalesce(_name, 'workspace')), '[^a-z0-9]+', '-', 'g'), '');
    v_base := btrim(coalesce(v_base, 'workspace'), '-');
    if v_base = '' then v_base := 'workspace'; end if;
    v_base := left(v_base, 40);
    v_slug := v_base;
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_slug := v_base || '-' || floor(random() * 9000 + 1000)::int;
    end loop;

    v_ends := now() + make_interval(days => GREATEST(1, LEAST(1, COALESCE(_trial_days, 1))));

    insert into public.organizations (name, slug, industry, created_by, subscription_status, trial_ends_at)
    values (
      coalesce(nullif(btrim(coalesce(_name, '')), ''), 'My business'),
      v_slug,
      nullif(btrim(coalesce(_industry, '')), ''),
      v_user,
      'trialing',
      v_ends
    )
    returning id into v_org;

    insert into public.memberships (organization_id, user_id, role)
    values (v_org, v_user, 'owner')
    on conflict do nothing;
  end if;

  insert into public.business_profiles (organization_id, profile)
  values (v_org, coalesce(_profile, '{}'::jsonb))
  on conflict (organization_id) do update
    set profile = coalesce(excluded.profile, public.business_profiles.profile),
        updated_at = now();

  insert into public.platform_trials (organization_id, started_at, trial_ends_at)
  select v_org, now(), coalesce(o.trial_ends_at, now() + interval '1 day')
  from public.organizations o
  where o.id = v_org
  on conflict (organization_id) do nothing;

  return v_org;
end;
$function$;

REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) TO service_role;

-- Published offer row mirrors the 1-day full-access window.
UPDATE public.offer_config SET full_access_days = 1 WHERE full_access_days <> 1;
