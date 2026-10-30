-- Website mutation RPCs are SECURITY DEFINER trust-boundary functions.
-- They are invoked by the server-side application/Edge Functions, not by the
-- browser. Anonymous and authenticated clients must not be able to call them
-- directly, even though the functions perform their own authorization checks.
-- Guard retired signatures so this hardening is safely replayable.
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.apply_ai_website_changes(uuid,jsonb,uuid,text)',
    'public.apply_website_theme(uuid,text,text,text,text,text)',
    'public.create_website_snapshot(uuid)',
    'public.generate_industry_website(uuid,text,text,text,text)',
    'public.publish_website_draft(uuid,uuid)'
  ] LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', signature);
    END IF;
  END LOOP;
END
$$;
