-- Explicit access rules for the 28 public tables that have RLS enabled but no
-- policy anywhere in supabase/migrations or drizzle/migrations (Supabase
-- advisor lint 0008 "rls_enabled_no_policy"; Lovable counted 31 live, the
-- other 3 are the leftover *_gmail_orphan tables that exist only in the live DB).
--
-- Every one of these tables is read and written only from server code through
-- the service-role client (supabaseAdmin), usually after assertSuperAdmin; no
-- browser or authenticated-client path touches them. None of them is
-- organization-scoped user data that members should read, so the correct rule
-- is service-role only:
--   * one explicit "service role full access" policy (documents intent and
--     clears the advisor; service_role bypasses RLS anyway, so no behaviour change),
--   * REVOKE ALL from PUBLIC, anon and authenticated (with RLS on and no
--     member policy they could already read/write nothing; this also removes
--     TRUNCATE/REFERENCES/TRIGGER, which RLS does not cover),
--   * explicit GRANT ALL to service_role.
--
-- Idempotent and order-independent: each table is guarded by to_regclass and
-- each policy by a pg_policies check. No DROP, no row changes.

DO $svc$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_paid_daily_budget',
    'ai_paid_spend_reservations',
    'internal_job_config',
    'jarvis_attachments',
    'jarvis_autopilot_actions',
    'jarvis_autopilot_audit_events',
    'jarvis_autopilot_runs',
    'jarvis_autopilot_settings',
    'jarvis_instagram_connections',
    'jarvis_instagram_oauth',
    'jarvis_instagram_posts',
    'jarvis_memory_embeddings',
    'jarvis_upload_quotas',
    'lifecycle_email_optouts',
    'prospect_autopilot_runs',
    'prospect_autopilot_settings',
    'prospect_contact_consent',
    'prospect_do_not_contact',
    'prospect_import_queue',
    'prospect_inbound',
    'prospect_outreach',
    'prospect_outreach_unsubscribe_tokens',
    'prospect_preview_events',
    'prospect_reply_poll_state',
    'prospect_rotation_cursor',
    'prospect_send_queue',
    'voice_daily_budget',
    'voice_link_claims'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'public.% does not exist; skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || ' service role full access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || ' service role full access', t
      );
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$svc$;
