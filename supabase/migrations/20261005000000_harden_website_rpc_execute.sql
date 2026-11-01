BEGIN;

-- Website mutation RPCs are SECURITY DEFINER trust-boundary functions.
-- They are invoked by the server-side application/Edge Functions, not by the
-- browser. Anonymous and authenticated clients must not be able to call them
-- directly, even though the functions perform their own authorization checks.
--
-- None of these functions is created by any migration in this repository (and
-- none appears in the generated database types), so the bare REVOKEs failed
-- with 42883 and stopped every later migration. Each lock-down now runs only
-- where the function exists.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.apply_ai_website_changes(uuid, jsonb, uuid, text)',
    'public.apply_website_theme(uuid, text, text, text, text, text)',
    'public.create_website_snapshot(uuid)',
    'public.generate_industry_website(uuid, text, text, text, text)',
    'public.publish_website_draft(uuid, uuid)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

COMMIT;
