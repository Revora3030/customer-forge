-- Performance-only: cover the 17 foreign keys that have no covering index on
-- the live database (Supabase lint 0001 unindexed_foreign_keys, Bastion audit
-- 2026-11-04). Without an index, every DELETE/UPDATE of a parent row scans the
-- child table, and joins/filters on these columns are sequential scans.
--
-- Behaviour is unchanged: no policy, grant, row or column changes.
-- Idempotent: CREATE INDEX IF NOT EXISTS, and each table is guarded by
-- to_regclass so a table that does not exist yet is skipped (re-run later).
-- No DROP statements.

DO $fk_idx$
DECLARE
  spec text[];
  specs constant text[][] := ARRAY[
    ARRAY['prospect_import_queue',    'organization_id', 'prospect_import_queue_organization_id_fk_idx'],
    ARRAY['jarvis_approvals',         'message_id',      'jarvis_approvals_message_id_fk_idx'],
    ARRAY['agent_action_requests',    'decided_by',      'agent_action_requests_decided_by_fk_idx'],
    ARRAY['review_feedback_requests', 'appointment_id',  'review_feedback_requests_appointment_id_fk_idx'],
    ARRAY['review_feedback_requests', 'lead_id',         'review_feedback_requests_lead_id_fk_idx'],
    ARRAY['review_feedback_requests', 'review_id',       'review_feedback_requests_review_id_fk_idx'],
    ARRAY['estimate_signatures',      'recorded_by',     'estimate_signatures_recorded_by_fk_idx'],
    ARRAY['agent_runs',               'user_id',         'agent_runs_user_id_fk_idx'],
    ARRAY['agent_approvals',          'requested_by',    'agent_approvals_requested_by_fk_idx'],
    ARRAY['agent_approvals',          'decided_by',      'agent_approvals_decided_by_fk_idx'],
    ARRAY['agent_settings',           'updated_by',      'agent_settings_updated_by_fk_idx'],
    ARRAY['agent_limits',             'updated_by',      'agent_limits_updated_by_fk_idx'],
    ARRAY['agent_routines',           'created_by',      'agent_routines_created_by_fk_idx'],
    ARRAY['agent_routines',           'last_run_id',     'agent_routines_last_run_id_fk_idx'],
    ARRAY['qa_jobs',                  'run_id',          'qa_jobs_run_id_fk_idx'],
    ARRAY['website_rules',            'updated_by',      'website_rules_updated_by_fk_idx'],
    ARRAY['jarvis_memories',          'superseded_by',   'jarvis_memories_superseded_by_fk_idx']
  ];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    IF to_regclass('public.' || spec[1]) IS NULL THEN
      RAISE NOTICE 'public.% is missing; skipped %', spec[1], spec[3];
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.' || spec[1])
        AND attname = spec[2] AND NOT attisdropped
    ) THEN
      RAISE NOTICE 'public.%.% is missing; skipped %', spec[1], spec[2], spec[3];
      CONTINUE;
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', spec[3], spec[1], spec[2]);
  END LOOP;
END
$fk_idx$;
