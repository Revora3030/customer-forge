-- Restore the owner-approved Revora commercial offer in application-backed tables.
-- Setup is $750 once; the platform is $100/month with a separate 30-day
-- Stripe subscription trial (the first month is free). Signup full access is
-- one day. Existing explicitly granted trial end timestamps are not shortened
-- retroactively; future organizations receive the one-day window.
BEGIN;

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_revora_offer_locked;
ALTER TABLE public.payment_products DROP CONSTRAINT IF EXISTS payment_products_revora_offer_locked;
ALTER TABLE public.offer_config DROP CONSTRAINT IF EXISTS offer_config_revora_offer_locked;

UPDATE public.plans
SET setup_price = 750, monthly_price = 100, annual_price = 0
WHERE id = 'revora_growth_system';

UPDATE public.payment_products
SET amount = 750
WHERE id = 'revora_growth_system_setup';

UPDATE public.offer_config
SET setup_price = 750, monthly_price = 100, trial_days = 30, full_access_days = 1, updated_at = now()
WHERE id = 'growth_system';

INSERT INTO public.offer_config (id, setup_price, monthly_price, trial_days, full_access_days)
VALUES ('growth_system', 750, 100, 30, 1)
ON CONFLICT (id) DO UPDATE
SET setup_price = EXCLUDED.setup_price,
    monthly_price = EXCLUDED.monthly_price,
    trial_days = EXCLUDED.trial_days,
    full_access_days = EXCLUDED.full_access_days,
    updated_at = now();

ALTER TABLE public.plans ADD CONSTRAINT plans_revora_offer_locked CHECK (
  id <> 'revora_growth_system'
  OR (monthly_price = 100 AND setup_price = 750 AND annual_price = 0)
);

ALTER TABLE public.payment_products ADD CONSTRAINT payment_products_revora_offer_locked CHECK (
  (id <> 'revora_growth_system_setup' OR (amount = 750 AND upper(currency) = 'USD' AND kind = 'setup_fee'))
  AND
  (id <> 'revora_growth_system_monthly' OR (amount = 100 AND upper(currency) = 'USD' AND kind = 'subscription' AND billing_interval = 'monthly'))
);

ALTER TABLE public.offer_config ADD CONSTRAINT offer_config_revora_offer_locked CHECK (
  id <> 'growth_system'
  OR (setup_price = 750 AND monthly_price = 100 AND trial_days = 30 AND full_access_days = 1)
);

ALTER TABLE public.organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '1 day');

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
DECLARE
  v_user uuid := _user_id;
  v_org uuid;
  v_slug text;
  v_base text;
  v_ends timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user) THEN
    RAISE EXCEPTION 'UNKNOWN_USER';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 7));

  SELECT m.organization_id INTO v_org
  FROM public.memberships m
  WHERE m.user_id = v_user
  ORDER BY m.created_at
  LIMIT 1;

  IF v_org IS NULL THEN
    v_base := nullif(regexp_replace(lower(coalesce(_name, 'workspace')), '[^a-z0-9]+', '-', 'g'), '');
    v_base := btrim(coalesce(v_base, 'workspace'), '-');
    IF v_base = '' THEN v_base := 'workspace'; END IF;
    v_base := left(v_base, 40);
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
      v_slug := v_base || '-' || floor(random() * 9000 + 1000)::int;
    END LOOP;

    -- Do not let callers extend the signup window by passing a larger duration.
    v_ends := now() + interval '1 day';

    INSERT INTO public.organizations (name, slug, industry, created_by, subscription_status, trial_ends_at)
    VALUES (
      coalesce(nullif(btrim(coalesce(_name, '')), ''), 'My business'),
      v_slug,
      nullif(btrim(coalesce(_industry, '')), ''),
      v_user,
      'trialing',
      v_ends
    )
    RETURNING id INTO v_org;

    INSERT INTO public.memberships (organization_id, user_id, role)
    VALUES (v_org, v_user, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.business_profiles (organization_id, email, phone, city, state, website, description)
    VALUES (
      v_org,
      nullif(btrim(coalesce(_profile->>'email','')), ''),
      nullif(btrim(coalesce(_profile->>'phone','')), ''),
      nullif(btrim(coalesce(_profile->>'city','')), ''),
      nullif(btrim(coalesce(_profile->>'state','')), ''),
      nullif(btrim(coalesce(_profile->>'website','')), ''),
      nullif(btrim(coalesce(_profile->>'description','')), '')
    )
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.platform_trials (organization_id, kind, started_by, started_at, trial_ends_at)
    VALUES (v_org, 'free_access', v_user, now(), v_ends)
    ON CONFLICT (organization_id, kind) DO NOTHING;
  ELSE
    INSERT INTO public.memberships (organization_id, user_id, role)
    VALUES (v_org, v_user, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.business_profiles (organization_id)
    VALUES (v_org)
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.platform_trials (organization_id, kind, started_by, started_at, trial_ends_at)
    SELECT v_org, 'free_access', v_user, o.created_at, o.trial_ends_at
    FROM public.organizations o
    WHERE o.id = v_org AND o.trial_ends_at IS NOT NULL
    ON CONFLICT (organization_id, kind) DO NOTHING;
  END IF;

  RETURN v_org;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) FROM anon;
REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) TO service_role;

COMMIT;
