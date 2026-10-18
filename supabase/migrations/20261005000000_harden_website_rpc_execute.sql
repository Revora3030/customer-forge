-- Website mutation RPC execute hardening.
--
-- NOTE (2026-10-17): none of the five functions below exist in production, no
-- repo migration creates them and nothing in src calls them. The original
-- unguarded REVOKE/GRANT statements therefore failed with 42883 and this file
-- was never applied. It is kept, guarded, so a replay is a safe no-op: each
-- signature is resolved with to_regprocedure() and only an existing function
-- is revoked from PUBLIC/anon/authenticated (and kept callable by
-- service_role, as originally intended).
BEGIN;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.apply_ai_website_changes(uuid, jsonb, uuid, text)',
    'public.apply_website_theme(uuid, text, text, text, text, text)',
    'public.create_website_snapshot(uuid)',
    'public.generate_industry_website(uuid, text, text, text, text)',
    'public.publish_website_draft(uuid, uuid)'
  ]
  LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    ELSE
      RAISE NOTICE 'skipping absent function %', sig;
    END IF;
  END LOOP;
END
$$;

COMMIT;
