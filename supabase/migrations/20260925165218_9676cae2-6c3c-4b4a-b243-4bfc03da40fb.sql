CREATE OR REPLACE FUNCTION public.register_public_submission_attempt(
  _organization_id uuid,
  _purpose text,
  _ip_hash text,
  _contact_hash text DEFAULT NULL::text,
  _user_agent_hash text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purpose text := lower(left(btrim(coalesce(_purpose, '')), 80));
  v_ip_hash text := lower(left(btrim(coalesce(_ip_hash, '')), 128));
  v_contact_hash text := nullif(lower(left(btrim(coalesce(_contact_hash, '')), 128)), '');
  v_user_agent_hash text := nullif(lower(left(btrim(coalesce(_user_agent_hash, '')), 128)), '');
  v_ip_10m integer := 0;
  v_ip_1h integer := 0;
  v_contact_10m integer := 0;
  v_fingerprint_10m integer := 0;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'ORG_REQUIRED';
  END IF;

  IF v_purpose !~ '^[a-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'INVALID_PURPOSE';
  END IF;

  IF v_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_IP_HASH';
  END IF;

  IF v_contact_hash IS NOT NULL AND v_contact_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_CONTACT_HASH';
  END IF;

  IF v_user_agent_hash IS NOT NULL AND v_user_agent_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'INVALID_USER_AGENT_HASH';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_purpose || '|' || _organization_id::text || '|' || v_ip_hash, 8801)
  );

  SELECT count(*) INTO v_ip_10m
  FROM public.public_submission_attempts a
  WHERE a.organization_id = _organization_id
    AND a.purpose = v_purpose
    AND a.ip_hash = v_ip_hash
    AND a.created_at > now() - interval '10 minutes';

  SELECT count(*) INTO v_ip_1h
  FROM public.public_submission_attempts a
  WHERE a.organization_id = _organization_id
    AND a.purpose = v_purpose
    AND a.ip_hash = v_ip_hash
    AND a.created_at > now() - interval '1 hour';

  IF v_contact_hash IS NOT NULL THEN
    SELECT count(*) INTO v_contact_10m
    FROM public.public_submission_attempts a
    WHERE a.organization_id = _organization_id
      AND a.purpose = v_purpose
      AND a.contact_hash = v_contact_hash
      AND a.created_at > now() - interval '10 minutes';
  END IF;

  IF v_user_agent_hash IS NOT NULL THEN
    SELECT count(*) INTO v_fingerprint_10m
    FROM public.public_submission_attempts a
    WHERE a.organization_id = _organization_id
      AND a.purpose = v_purpose
      AND a.ip_hash = v_ip_hash
      AND a.user_agent_hash = v_user_agent_hash
      AND a.created_at > now() - interval '10 minutes';
  END IF;

  IF v_contact_10m >= 6 OR v_fingerprint_10m >= 12 OR v_ip_10m >= 20 OR v_ip_1h >= 80 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'RATE_LIMITED',
      'ip_10m', v_ip_10m,
      'ip_1h', v_ip_1h,
      'contact_10m', v_contact_10m,
      'fingerprint_10m', v_fingerprint_10m
    );
  END IF;

  INSERT INTO public.public_submission_attempts (
    organization_id,
    purpose,
    ip_hash,
    contact_hash,
    user_agent_hash
  ) VALUES (
    _organization_id,
    v_purpose,
    v_ip_hash,
    v_contact_hash,
    v_user_agent_hash
  );

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', null,
    'ip_10m', v_ip_10m + 1,
    'ip_1h', v_ip_1h + 1,
    'contact_10m', CASE WHEN v_contact_hash IS NULL THEN null ELSE v_contact_10m + 1 END,
    'fingerprint_10m', CASE WHEN v_user_agent_hash IS NULL THEN null ELSE v_fingerprint_10m + 1 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_public_submission_attempt(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_public_submission_attempt(uuid, text, text, text, text) TO service_role;