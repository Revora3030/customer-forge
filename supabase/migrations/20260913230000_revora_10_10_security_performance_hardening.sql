-- Revora 10/10 hardening pass
-- Security: keep platform control-plane tables server-only and remove browser access
-- to the public conversion RPC. Performance: add safe FK indexes where missing.
-- This migration intentionally does NOT revoke provision_workspace(authenticated),
-- because the current onboarding flow invokes it in the caller's auth context.

BEGIN;

-- -----------------------------------------------------------------------------
-- Control-plane isolation
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_trials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_accounts_no_direct_client_access" ON public.platform_accounts;
CREATE POLICY "platform_accounts_no_direct_client_access"
  ON public.platform_accounts
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "platform_trials_no_direct_client_access" ON public.platform_trials;
CREATE POLICY "platform_trials_no_direct_client_access"
  ON public.platform_trials
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.platform_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_trials FROM anon, authenticated;
GRANT ALL ON TABLE public.platform_accounts TO service_role;
GRANT ALL ON TABLE public.platform_trials TO service_role;

-- The public conversion endpoint must be mediated by the application server so
-- callers cannot invoke the SECURITY DEFINER function directly from the browser.
REVOKE EXECUTE ON FUNCTION public.submit_public_conversion(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_conversion(text, text, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- Foreign-key indexing
--
-- PostgreSQL does not automatically index referencing columns. Missing indexes
-- can make deletes/updates on parent rows and tenant-scoped joins unnecessarily
-- expensive. Only create a simple, non-partial btree index when no existing
-- index covers the FK columns as a leftmost prefix.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  fk RECORD;
  cols TEXT;
  idx_name TEXT;
  covered BOOLEAN;
BEGIN
  FOR fk IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) AS quoted_cols,
      string_agg(a.attname, ', ' ORDER BY k.ord) AS raw_cols
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND c.relkind = 'r'
    GROUP BY n.nspname, c.relname, con.conname
  LOOP
    covered := EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indrelid = format('%I.%I', fk.schema_name, fk.table_name)::regclass
        AND i.indisvalid
        AND i.indisready
        AND NOT i.indispartial
        AND i.indnkeyatts >= array_length(string_to_array(fk.raw_cols, ', '), 1)
        AND (
          SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(i.indkey[0:i.indnkeyatts-1]) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = u.attnum
        )::text[] @> string_to_array(fk.raw_cols, ', ')::text[]
        AND (
          SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(i.indkey[0:i.indnkeyatts-1]) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = u.attnum
        )::text[] [1:array_length(string_to_array(fk.raw_cols, ', '), 1)] = string_to_array(fk.raw_cols, ', ')::text[]
    );

    IF NOT covered THEN
      idx_name := left(
        regexp_replace(
          format('%s_%s_fk_idx', fk.table_name, replace(fk.raw_cols, ', ', '_')),
          '[^a-zA-Z0-9_]', '_', 'g'
        ),
        63
      );

      IF NOT EXISTS (
        SELECT 1 FROM pg_class ic
        JOIN pg_namespace ins ON ins.oid = ic.relnamespace
        WHERE ins.nspname = fk.schema_name AND ic.relname = idx_name
      ) THEN
        cols := fk.quoted_cols;
        EXECUTE format(
          'CREATE INDEX %I ON %I.%I (%s)',
          idx_name, fk.schema_name, fk.table_name, cols
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Known exact duplicate indexes found during the Revora performance audit.
-- Keep the canonical/unique versions and remove only exact duplicates.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.leads_org_recent_idx;
DROP INDEX IF EXISTS public.payment_events_provider_event_idx;

COMMIT;
