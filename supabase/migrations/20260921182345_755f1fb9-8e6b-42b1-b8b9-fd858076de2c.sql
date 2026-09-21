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

create or replace function public.provision_workspace_server(
  _user_id uuid,
  _name text,
  _industry text default null,
  _profile jsonb default '{}'::jsonb,
  _trial_days integer default 1
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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

    insert into public.business_profiles (organization_id, email, phone, city, state, website, description)
    values (
      v_org,
      nullif(btrim(coalesce(_profile->>'email','')), ''),
      nullif(btrim(coalesce(_profile->>'phone','')), ''),
      nullif(btrim(coalesce(_profile->>'city','')), ''),
      nullif(btrim(coalesce(_profile->>'state','')), ''),
      nullif(btrim(coalesce(_profile->>'website','')), ''),
      nullif(btrim(coalesce(_profile->>'description','')), '')
    )
    on conflict (organization_id) do nothing;

    insert into public.platform_trials (organization_id, kind, started_by, started_at, trial_ends_at)
    values (v_org, 'free_access', v_user, now(), v_ends)
    on conflict (organization_id, kind) do nothing;
  else
    insert into public.memberships (organization_id, user_id, role)
    values (v_org, v_user, 'owner')
    on conflict do nothing;

    insert into public.business_profiles (organization_id)
    values (v_org)
    on conflict (organization_id) do nothing;

    insert into public.platform_trials (organization_id, kind, started_by, started_at, trial_ends_at)
    select v_org, 'free_access', v_user, o.created_at, o.trial_ends_at
    from public.organizations o
    where o.id = v_org and o.trial_ends_at is not null
    on conflict (organization_id, kind) do nothing;
  end if;

  return v_org;
end;
$function$;

revoke all on function public.provision_workspace_server(uuid, text, text, jsonb, integer) from public;
revoke all on function public.provision_workspace_server(uuid, text, text, jsonb, integer) from anon;
revoke all on function public.provision_workspace_server(uuid, text, text, jsonb, integer) from authenticated;
grant execute on function public.provision_workspace_server(uuid, text, text, jsonb, integer) to service_role;

-- The locked offer row keeps $750 + $100/month and now pins the 1-day window.
ALTER TABLE public.offer_config DROP CONSTRAINT IF EXISTS offer_config_revora_offer_locked;
UPDATE public.offer_config SET full_access_days = 1 WHERE id = 'growth_system' AND full_access_days <> 1;
ALTER TABLE public.offer_config ADD CONSTRAINT offer_config_revora_offer_locked
  CHECK (
    id <> 'growth_system'
    OR (setup_price = 750 AND monthly_price = 100 AND trial_days = 30 AND full_access_days = 1)
  );