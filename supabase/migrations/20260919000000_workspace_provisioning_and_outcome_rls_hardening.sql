-- Security/performance hardening for workspace provisioning and outcome RLS.
-- Reversible: see rollback section at the end. This migration is intentionally
-- not applied to production by this PR.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Remove the public authenticated RPC trust boundary.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.provision_workspace(text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;

-- A server-only entry point. The application server authenticates the caller
-- before invoking this function and supplies the already-verified auth user id.
-- No client role receives EXECUTE.
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
SET search_path = public, extensions
AS $$
DECLARE
  v_org uuid;
  v_slug text;
  v_base text;
  v_ends timestamptz;
  v_trial_days integer := GREATEST(1, LEAST(3, COALESCE(_trial_days, 3)));
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_USER';
  END IF;

  IF _name IS NULL OR length(btrim(_name)) = 0 OR length(_name) > 120 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  IF _industry IS NOT NULL AND length(btrim(_industry)) > 80 THEN
    RAISE EXCEPTION 'INVALID_INDUSTRY';
  END IF;

  IF _profile IS NULL OR jsonb_typeof(_profile) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PROFILE';
  END IF;

  IF jsonb_object_length(_profile) > 20 THEN
    RAISE EXCEPTION 'INVALID_PROFILE';
  END IF;

  -- Serialize retries for the same authenticated person.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 7));

  SELECT m.organization_id
    INTO v_org
  FROM public.memberships m
  WHERE m.user_id = _user_id
  ORDER BY m.created_at
  LIMIT 1;

  IF v_org IS NULL THEN
    v_base := nullif(
      regexp_replace(lower(coalesce(_name, 'workspace')), '[^a-z0-9]+', '-', 'g'),
      ''
    );
    v_base := btrim(coalesce(v_base, 'workspace'), '-');
    IF v_base = '' THEN v_base := 'workspace'; END IF;
    v_base := left(v_base, 40);
    v_slug := v_base;

    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
      v_slug := v_base || '-' || floor(random() * 9000 + 1000)::int;
    END LOOP;

    v_ends := now() + make_interval(days => v_trial_days);

    INSERT INTO public.organizations (
      name, slug, industry, created_by, subscription_status, trial_ends_at
    )
    VALUES (
      btrim(_name),
      v_slug,
      nullif(btrim(coalesce(_industry, '')), ''),
      _user_id,
      'trialing',
      v_ends
    )
    RETURNING id INTO v_org;

    INSERT INTO public.memberships (organization_id, user_id, role)
    VALUES (v_org, _user_id, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.business_profiles (
      organization_id, email, phone, city, state, website, description
    )
    VALUES (
      v_org,
      nullif(btrim(coalesce(_profile->>'email', '')), ''),
      nullif(btrim(coalesce(_profile->>'phone', '')), ''),
      nullif(btrim(coalesce(_profile->>'city', '')), ''),
      nullif(btrim(coalesce(_profile->>'state', '')), ''),
      nullif(btrim(coalesce(_profile->>'website', '')), ''),
      nullif(btrim(coalesce(_profile->>'description', '')), '')
    )
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.platform_trials (
      organization_id, kind, started_by, started_at, trial_ends_at
    )
    VALUES (v_org, 'free_access', _user_id, now(), v_ends)
    ON CONFLICT (organization_id, kind) DO NOTHING;
  ELSE
    INSERT INTO public.memberships (organization_id, user_id, role)
    VALUES (v_org, _user_id, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.business_profiles (organization_id)
    VALUES (v_org)
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.platform_trials (
      organization_id, kind, started_by, started_at, trial_ends_at
    )
    SELECT v_org, 'free_access', _user_id, o.created_at, o.trial_ends_at
    FROM public.organizations o
    WHERE o.id = v_org AND o.trial_ends_at IS NOT NULL
    ON CONFLICT (organization_id, kind) DO NOTHING;
  END IF;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Missing FK indexes: exact three advisor findings.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS improvement_recommendations_created_by_idx
  ON public.improvement_recommendations (created_by);

CREATE INDEX IF NOT EXISTS outcome_evidence_created_by_idx
  ON public.outcome_evidence (created_by);

CREATE INDEX IF NOT EXISTS outcome_snapshots_created_by_idx
  ON public.outcome_snapshots (created_by);

-- ---------------------------------------------------------------------------
-- 3. RLS auth init-plan optimization.
-- Exact authorization semantics are preserved; only auth.uid() evaluation
-- changes from per-row to init-plan evaluation.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "members can read outcome snapshots" ON public.outcome_snapshots;
CREATE POLICY "members can read outcome snapshots"
  ON public.outcome_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = outcome_snapshots.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members can create outcome snapshots" ON public.outcome_snapshots;
CREATE POLICY "members can create outcome snapshots"
  ON public.outcome_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = outcome_snapshots.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members can read outcome evidence" ON public.outcome_evidence;
CREATE POLICY "members can read outcome evidence"
  ON public.outcome_evidence
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = outcome_evidence.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members can create outcome evidence" ON public.outcome_evidence;
CREATE POLICY "members can create outcome evidence"
  ON public.outcome_evidence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = outcome_evidence.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members can read improvement recommendations" ON public.improvement_recommendations;
CREATE POLICY "members can read improvement recommendations"
  ON public.improvement_recommendations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = improvement_recommendations.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members can create improvement recommendations" ON public.improvement_recommendations;
CREATE POLICY "members can create improvement recommendations"
  ON public.improvement_recommendations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = improvement_recommendations.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members can update improvement recommendations" ON public.improvement_recommendations;
CREATE POLICY "members can update improvement recommendations"
  ON public.improvement_recommendations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = improvement_recommendations.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organization_id = improvement_recommendations.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

COMMIT;

-- Rollback guidance (run only after reviewing current production state):
-- DROP INDEX IF EXISTS public.improvement_recommendations_created_by_idx;
-- DROP INDEX IF EXISTS public.outcome_evidence_created_by_idx;
-- DROP INDEX IF EXISTS public.outcome_snapshots_created_by_idx;
-- Recreate the seven policies from the immediately preceding migration with
-- auth.uid() in their membership predicates.
-- Restore EXECUTE on provision_workspace only if the application has been
-- deliberately reverted to the browser-RPC onboarding path:
-- GRANT EXECUTE ON FUNCTION public.provision_workspace(text,text,jsonb,integer) TO authenticated;
