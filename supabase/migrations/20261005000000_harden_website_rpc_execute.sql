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
BEGIN
  IF to_regprocedure('public.apply_ai_website_changes(uuid, jsonb, uuid, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.apply_ai_website_changes(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.apply_ai_website_changes(uuid, jsonb, uuid, text) TO service_role;
  END IF;
  IF to_regprocedure('public.apply_website_theme(uuid, text, text, text, text, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.apply_website_theme(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.apply_website_theme(uuid, text, text, text, text, text) TO service_role;
  END IF;
  IF to_regprocedure('public.create_website_snapshot(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.create_website_snapshot(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_website_snapshot(uuid) TO service_role;
  END IF;
  IF to_regprocedure('public.generate_industry_website(uuid, text, text, text, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.generate_industry_website(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.generate_industry_website(uuid, text, text, text, text) TO service_role;
  END IF;
  IF to_regprocedure('public.publish_website_draft(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.publish_website_draft(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.publish_website_draft(uuid, uuid) TO service_role;
  END IF;
END $$;

COMMIT;
