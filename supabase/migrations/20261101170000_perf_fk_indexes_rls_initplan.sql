-- Performance-only fixes from the 2026-11-01 Supabase audit (§7.1 + §7.2).
-- Behaviour is unchanged: same rows visible/writable under every policy.
-- Idempotent: safe to re-run; a second run creates and alters nothing.

-- 1) Cover the two foreign keys added in 20261005140000, which ran after the
--    generic FK-index loop in 20260913230000 (Supabase lint 0001
--    unindexed_foreign_keys).
DO $$
BEGIN
  IF to_regclass('public.image_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS image_records_media_id_fk_idx
      ON public.image_records (media_id);
  END IF;
  IF to_regclass('public.lead_tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS lead_tasks_lead_id_organization_id_fk_idx
      ON public.lead_tasks (lead_id, organization_id);
  END IF;
END $$;

-- 2) RLS initplan (Supabase lint 0003 auth_rls_initplan): rewrite bare
--    auth.uid()/auth.jwt()/auth.role() in public policies to
--    (select auth.x()) so Postgres evaluates it once per statement instead
--    of once per row. The result of the call is identical, so access is the
--    same. Already-wrapped calls (deparsed as "( SELECT auth.uid() AS uid)")
--    are protected first and left as they are; policies with no bare call are
--    not touched, so re-running alters nothing. Only USING / WITH CHECK
--    change — roles, command and permissive/restrictive stay as they were.
DO $$
DECLARE
  p record;
  q text;
  w text;
  pat constant text := 'auth\.(uid|jwt|role)\(\)';
  wrapped constant text := '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+\w+\)';
  remaining int;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    q := regexp_replace(coalesce(p.qual, ''), wrapped, '@@KEEP_\1@@', 'gi');
    w := regexp_replace(coalesce(p.with_check, ''), wrapped, '@@KEEP_\1@@', 'gi');
    IF p.qual IS NOT NULL AND q ~ pat THEN
      q := regexp_replace(regexp_replace(q, pat, '(select auth.\1())', 'g'),
                          '@@KEEP_(uid|jwt|role)@@', '(select auth.\1())', 'g');
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     p.policyname, p.schemaname, p.tablename, q);
    END IF;
    IF p.with_check IS NOT NULL AND w ~ pat THEN
      w := regexp_replace(regexp_replace(w, pat, '(select auth.\1())', 'g'),
                          '@@KEEP_(uid|jwt|role)@@', '(select auth.\1())', 'g');
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     p.policyname, p.schemaname, p.tablename, w);
    END IF;
  END LOOP;

  -- Self-check: no bare call may remain (fails the migration, and so rolls it
  -- back, rather than leaving a half-rewritten set of policies).
  SELECT count(*) INTO remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (regexp_replace(coalesce(qual, ''), wrapped, '', 'gi') ~ pat
      OR regexp_replace(coalesce(with_check, ''), wrapped, '', 'gi') ~ pat);
  IF remaining > 0 THEN
    RAISE EXCEPTION 'rls initplan rewrite left % policies with bare auth calls', remaining;
  END IF;
END $$;
