-- Final production hardening migration.
-- Additive and reversible. Do not apply to production without the
-- non-production verification checklist in docs/runbooks/live-verification-checklist.md.
BEGIN;

-- 1) Remove the authenticated/public RPC entry point.
REVOKE EXECUTE ON FUNCTION public.provision_workspace(text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;

-- 2) Keep the existing provisioning behavior, but move the trust boundary to
-- the server by requiring the authenticated user id as an explicit argument.
-- Only service_role may execute this function.
CREATE OR REPLACE FUNCTION public.provision_workspace_server(
  _user_id uuid,
  _name text,
  _industry text DEFAULT NULL,
  _profile jsonb DEFAULT '{}'::jsonb,
  _trial_days integer DEFAULT 3
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
    RAISE EXCEPTION 'USER_REQUIRED';
  END IF;

  IF nullif(btrim(coalesce(_name, '')), '') IS NULL
     OR length(btrim(_name)) > 120 THEN
    RAISE EXCEPTION 'INVALID_WORKSPACE_NAME';
  END IF;

  IF _industry IS NOT NULL AND length(btrim(_industry)) > 80 THEN
    RAISE EXCEPTION 'INVALID_INDUSTRY';
  END IF;

  IF _profile IS NULL OR jsonb_typeof(_profile) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PROFILE';
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(_profile)) > 20 THEN
    RAISE EXCEPTION 'PROFILE_TOO_LARGE';
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

    v_ends := now() + make_interval(days => greatest(1, least(3, coalesce(_trial_days, 3))));

    INSERT INTO public.organizations (
      name, slug, industry, created_by, subscription_status, trial_ends_at
    )
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

    INSERT INTO public.business_profiles (
      organization_id, email, phone, city, state, website, description
    )
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

    INSERT INTO public.platform_trials (
      organization_id, kind, started_by, started_at, trial_ends_at
    )
    VALUES (v_org, 'free_access', v_user, now(), v_ends)
    ON CONFLICT (organization_id, kind) DO NOTHING;
  ELSE
    INSERT INTO public.memberships (organization_id, user_id, role)
    VALUES (v_org, v_user, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.business_profiles (organization_id)
    VALUES (v_org)
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.platform_trials (
      organization_id, kind, started_by, started_at, trial_ends_at
    )
    SELECT v_org, 'free_access', v_user, o.created_at, o.trial_ends_at
    FROM public.organizations o
    WHERE o.id = v_org AND o.trial_ends_at IS NOT NULL
    ON CONFLICT (organization_id, kind) DO NOTHING;
  END IF;

  RETURN v_org;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer)
  TO service_role;

-- 3) Cover the three currently reported foreign keys.
CREATE INDEX IF NOT EXISTS improvement_recommendations_created_by_idx
  ON public.improvement_recommendations (created_by);
CREATE INDEX IF NOT EXISTS outcome_evidence_created_by_idx
  ON public.outcome_evidence (created_by);
CREATE INDEX IF NOT EXISTS outcome_snapshots_created_by_idx
  ON public.outcome_snapshots (created_by);

-- 4) Fix the seven RLS init-plan warnings without changing tenant semantics.
DROP POLICY IF EXISTS "members can read outcome snapshots" ON public.outcome_snapshots;
CREATE POLICY "members can read outcome snapshots"
  ON public.outcome_snapshots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = outcome_snapshots.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "members can create outcome snapshots" ON public.outcome_snapshots;
CREATE POLICY "members can create outcome snapshots"
  ON public.outcome_snapshots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = outcome_snapshots.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "members can read outcome evidence" ON public.outcome_evidence;
CREATE POLICY "members can read outcome evidence"
  ON public.outcome_evidence FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = outcome_evidence.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "members can create outcome evidence" ON public.outcome_evidence;
CREATE POLICY "members can create outcome evidence"
  ON public.outcome_evidence FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = outcome_evidence.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "members can read improvement recommendations" ON public.improvement_recommendations;
CREATE POLICY "members can read improvement recommendations"
  ON public.improvement_recommendations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = improvement_recommendations.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "members can create improvement recommendations" ON public.improvement_recommendations;
CREATE POLICY "members can create improvement recommendations"
  ON public.improvement_recommendations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = improvement_recommendations.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "members can update improvement recommendations" ON public.improvement_recommendations;
CREATE POLICY "members can update improvement recommendations"
  ON public.improvement_recommendations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = improvement_recommendations.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.organization_id = improvement_recommendations.organization_id
      AND memberships.user_id = (SELECT auth.uid())
  ));

COMMIT;

-- Rollback guidance:
-- REVOKE EXECUTE ON FUNCTION public.provision_workspace_server(uuid,text,text,jsonb,integer)
--   FROM service_role;
-- DROP FUNCTION IF EXISTS public.provision_workspace_server(uuid,text,text,jsonb,integer);
-- GRANT EXECUTE ON FUNCTION public.provision_workspace(text,text,jsonb,integer) TO authenticated;
-- Recreate the seven original policies from the migration history if rollback is required.
