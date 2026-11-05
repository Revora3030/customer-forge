-- LOV-6 follow-up: make the intended access on the two preview-password tables
-- explicit (Supabase advisor 0008 rls_enabled_no_policy). Service role only;
-- anon and authenticated still have no grants. Additive and re-runnable.
DO $$
BEGIN
  IF to_regclass('public.website_preview_link_secrets') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'website_preview_link_secrets' AND policyname = 'preview_link_secrets_service_role_all'
  ) THEN
    CREATE POLICY preview_link_secrets_service_role_all ON public.website_preview_link_secrets
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF to_regclass('public.website_preview_unlock_attempts') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'website_preview_unlock_attempts' AND policyname = 'preview_unlock_attempts_service_role_all'
  ) THEN
    CREATE POLICY preview_unlock_attempts_service_role_all ON public.website_preview_unlock_attempts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
