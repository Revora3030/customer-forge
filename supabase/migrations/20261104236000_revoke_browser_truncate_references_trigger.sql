-- Defense in depth for browser roles (Bastion audit 2026-11-04).
--
-- Supabase's default privileges give anon and authenticated TRUNCATE,
-- REFERENCES and TRIGGER on every new public table. On the live database anon
-- holds TRUNCATE on 86 public tables and authenticated on 93. RLS does not
-- apply to TRUNCATE, and no browser flow needs REFERENCES or TRIGGER (the
-- PostgREST API never issues them), so removing them changes no app behaviour.
--
-- Scope: ONLY TRUNCATE, REFERENCES, TRIGGER, ONLY for anon and authenticated.
-- SELECT/INSERT/UPDATE/DELETE grants and every RLS policy stay exactly as they
-- are (per-table read/write grants are handled table by table elsewhere, e.g.
-- 20261103120000 and 20261103210000). service_role keeps ALL, granted
-- explicitly. Default privileges are tightened so new tables do not reopen the
-- gap. Idempotent (REVOKE/GRANT are safe to re-run). No DROP, no row changes.

DO $harden$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
  END LOOP;
END
$harden$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
