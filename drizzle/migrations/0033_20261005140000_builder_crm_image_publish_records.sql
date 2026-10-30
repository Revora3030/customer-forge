-- Builder, image, CRM and publish records (master production spec A, C, D, F, G, L).
--
-- Additive and idempotent. No existing row is deleted or relabelled, and no
-- existing policy or grant is relaxed. Every new table is tenant-scoped with
-- RLS keyed on organization_id and the same private.* role helpers the rest
-- of the schema uses.
--
-- 1. generation_jobs: owner-requested cancellation, the stage a failed build
--    stopped at, a structured failure kind and per-stage timings. A restart
--    re-runs the whole pipeline (stages are not checkpointed), so the stage
--    is recorded for the owner and operators, never used to skip work.
--    `cancelled` is a new terminal status (outside the one-active partial
--    index), so cancelling frees the workspace for a new build immediately.
-- 2. builder_messages: request id, structured message kind and branch, so a
--    reply is tied to the request that produced it and alternate directions
--    can be kept side by side.
-- 3. image_records: one row per website picture with its art direction,
--    approval state and verified rendered URL. Regenerating a picture is one
--    row, never the whole site.
-- 4. lead_tasks: follow-up tasks/reminders on leads (CRM).
-- 5. publish_events: append-only audit of each publish with the chosen
--    version and the post-publish smoke result.

-- 1. generation_jobs ---------------------------------------------------------
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS failed_stage text,
  ADD COLUMN IF NOT EXISTS failure_kind text,
  ADD COLUMN IF NOT EXISTS stage_timings jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generation_jobs_failure_kind_check'
  ) THEN
    ALTER TABLE public.generation_jobs
      ADD CONSTRAINT generation_jobs_failure_kind_check CHECK (
        failure_kind IS NULL OR failure_kind IN (
          'intake_validation','provider','content','image','rendering',
          'preview','publish','validation','infrastructure','cancelled'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS generation_jobs_failure_kind_idx
  ON public.generation_jobs (failure_kind, created_at DESC)
  WHERE failure_kind IS NOT NULL;

-- 2. builder_messages ----------------------------------------------------------
ALTER TABLE public.builder_messages
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'main';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builder_messages_kind_check') THEN
    ALTER TABLE public.builder_messages
      ADD CONSTRAINT builder_messages_kind_check CHECK (
        kind IN ('text','plan','result','question','error','voice','system')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builder_messages_request_id_check') THEN
    ALTER TABLE public.builder_messages
      ADD CONSTRAINT builder_messages_request_id_check CHECK (
        request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{4,80}$'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'builder_messages_branch_check') THEN
    ALTER TABLE public.builder_messages
      ADD CONSTRAINT builder_messages_branch_check CHECK (branch ~ '^[a-z0-9_-]{1,40}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS builder_messages_request_idx
  ON public.builder_messages (organization_id, request_id)
  WHERE request_id IS NOT NULL;

-- 3. image_records -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.image_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  media_id uuid REFERENCES public.media(id) ON DELETE SET NULL,
  slot text NOT NULL CHECK (char_length(slot) BETWEEN 1 AND 80),
  direction text NOT NULL DEFAULT '' CHECK (char_length(direction) <= 4000),
  alt_text text CHECK (alt_text IS NULL OR char_length(alt_text) <= 200),
  source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','owner','stock')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','regenerating','failed')),
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500),
  rendered_url text,
  rendered_verified_at timestamptz,
  provider text,
  model text,
  generation integer NOT NULL DEFAULT 1 CHECK (generation >= 1),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slot)
);
CREATE INDEX IF NOT EXISTS image_records_org_status_idx
  ON public.image_records (organization_id, status);

GRANT SELECT, INSERT, UPDATE ON public.image_records TO authenticated;
GRANT ALL ON public.image_records TO service_role;
ALTER TABLE public.image_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS image_records_read ON public.image_records;
CREATE POLICY image_records_read ON public.image_records FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());
DROP POLICY IF EXISTS image_records_insert ON public.image_records;
CREATE POLICY image_records_insert ON public.image_records FOR INSERT TO authenticated
  WITH CHECK (private.org_role_at_least(organization_id, 'manager'));
DROP POLICY IF EXISTS image_records_update ON public.image_records;
CREATE POLICY image_records_update ON public.image_records FOR UPDATE TO authenticated
  USING (private.org_role_at_least(organization_id, 'manager'))
  WITH CHECK (private.org_role_at_least(organization_id, 'manager'));

DROP TRIGGER IF EXISTS image_records_touch ON public.image_records;
CREATE TRIGGER image_records_touch BEFORE UPDATE ON public.image_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. lead_tasks ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  due_at timestamptz,
  done_at timestamptz,
  assigned_to uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A task can only point at a lead of the same workspace.
  CONSTRAINT lead_tasks_lead_same_org
    FOREIGN KEY (lead_id, organization_id)
    REFERENCES public.leads (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lead_tasks_org_due_idx
  ON public.lead_tasks (organization_id, due_at)
  WHERE done_at IS NULL;
CREATE INDEX IF NOT EXISTS lead_tasks_lead_idx ON public.lead_tasks (lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tasks TO authenticated;
GRANT ALL ON public.lead_tasks TO service_role;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_tasks_read ON public.lead_tasks;
CREATE POLICY lead_tasks_read ON public.lead_tasks FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());
DROP POLICY IF EXISTS lead_tasks_insert ON public.lead_tasks;
CREATE POLICY lead_tasks_insert ON public.lead_tasks FOR INSERT TO authenticated
  WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
DROP POLICY IF EXISTS lead_tasks_update ON public.lead_tasks;
CREATE POLICY lead_tasks_update ON public.lead_tasks FOR UPDATE TO authenticated
  USING (private.org_role_at_least(organization_id, 'staff'))
  WITH CHECK (private.org_role_at_least(organization_id, 'staff'));
DROP POLICY IF EXISTS lead_tasks_delete ON public.lead_tasks;
CREATE POLICY lead_tasks_delete ON public.lead_tasks FOR DELETE TO authenticated
  USING (private.org_role_at_least(organization_id, 'manager'));

DROP TRIGGER IF EXISTS lead_tasks_touch ON public.lead_tasks;
CREATE TRIGGER lead_tasks_touch BEFORE UPDATE ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. publish_events ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  source_version integer CHECK (source_version IS NULL OR source_version >= 1),
  published_by uuid,
  smoke_status text NOT NULL DEFAULT 'pending'
    CHECK (smoke_status IN ('pending','passed','failed','skipped')),
  smoke_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publish_events_org_idx
  ON public.publish_events (organization_id, created_at DESC);

-- Members read their own history; only the server writes it.
GRANT SELECT ON public.publish_events TO authenticated;
GRANT ALL ON public.publish_events TO service_role;
ALTER TABLE public.publish_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publish_events_read ON public.publish_events;
CREATE POLICY publish_events_read ON public.publish_events FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id) OR private.is_super_admin());
