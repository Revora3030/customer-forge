BEGIN;

-- Website mutation RPCs are SECURITY DEFINER trust-boundary functions.
-- They are invoked by the server-side application/Edge Functions, not by the
-- browser. Anonymous and authenticated clients must not be able to call them
-- directly, even though the functions perform their own authorization checks.
REVOKE ALL ON FUNCTION public.apply_ai_website_changes(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_website_changes(uuid, jsonb, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.apply_website_theme(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_website_theme(uuid, text, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_website_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_website_snapshot(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.generate_industry_website(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_industry_website(uuid, text, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.publish_website_draft(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_website_draft(uuid, uuid)
  TO service_role;

COMMIT;
