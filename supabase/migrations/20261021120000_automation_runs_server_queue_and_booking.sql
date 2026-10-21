-- 1. automation_runs are queued only by the server.
--
-- Until now `automation_runs_member_all` (FOR ALL, is_org_member) let any
-- workspace member insert a run with any trigger_event, recipient and body;
-- the delivery pass then sent it (the SMS opt-in check keys on the run's own
-- trigger_event, so a member could text anyone by writing 'lead_created').
--
-- After this migration:
-- * members keep SELECT (the automations screen and status center read runs);
-- * browsers cannot INSERT at all: runs are written by server functions
--   (src/lib/automation-queue.server.ts, public-site.functions.ts) with the
--   service role, which build trigger_event, recipient, subject and body from
--   the workspace's automation definitions and its own lead/booking rows;
-- * the only client UPDATE is staff+ cancelling a still-queued run, and only
--   the status column is updatable (column privilege), so trigger_event,
--   recipient, body, subject, action_type and scheduled_for can't be changed;
-- * staff+ may delete a run (cancel), members below staff may not.
--
-- Additive and re-runnable: policies are dropped/created by name, grants are
-- explicit, and no table or column is changed.

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_runs_member_all ON public.automation_runs;

DROP POLICY IF EXISTS automation_runs_member_read ON public.automation_runs;
CREATE POLICY automation_runs_member_read ON public.automation_runs
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS automation_runs_staff_cancel ON public.automation_runs;
CREATE POLICY automation_runs_staff_cancel ON public.automation_runs
  FOR UPDATE TO authenticated
  USING (private.org_role_at_least(organization_id, 'staff') AND status = 'queued')
  WITH CHECK (private.org_role_at_least(organization_id, 'staff') AND status = 'skipped');

DROP POLICY IF EXISTS automation_runs_staff_delete ON public.automation_runs;
CREATE POLICY automation_runs_staff_delete ON public.automation_runs
  FOR DELETE TO authenticated
  USING (private.org_role_at_least(organization_id, 'staff'));

REVOKE ALL ON public.automation_runs FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.automation_runs FROM authenticated;
GRANT SELECT, DELETE ON public.automation_runs TO authenticated;
GRANT UPDATE (status) ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

-- 2. Book a job in one transaction.
--
-- "Book this job" used to create the lead, then the appointment, then link the
-- quote in three browser round trips; a double click, a second tab or a failed
-- link produced a duplicate booking. book_appointment does all of it in one
-- transaction and links a quote only while its appointment_id is still null
-- (the quote row is locked first), so a second attempt fails with
-- 'quote_already_booked' and creates nothing.
--
-- SECURITY INVOKER: every statement runs under the caller's own RLS (members
-- write leads/appointments/activities; staff+ update quotes), plus explicit
-- tenant checks through the existing role helpers.
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_organization_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_service_id uuid,
  p_notes text,
  p_lead_id uuid,
  p_status public.appointment_status,
  p_estimated_value numeric,
  p_quote_id uuid,
  p_activity_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lead_id uuid;
  v_appointment_id uuid;
  v_quote_appointment uuid;
  v_quote_lead uuid;
  v_quote_status text;
  v_rows integer;
BEGIN
  IF p_organization_id IS NULL OR NOT private.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'invalid_time' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'missing_name' USING ERRCODE = '22023';
  END IF;

  IF p_quote_id IS NOT NULL THEN
    IF NOT private.org_role_at_least(p_organization_id, 'staff') THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
    -- Row lock: a concurrent booking of the same quote waits here, then sees
    -- the appointment the first one linked.
    SELECT q.appointment_id, q.lead_id, q.status
      INTO v_quote_appointment, v_quote_lead, v_quote_status
      FROM public.quotes AS q
     WHERE q.id = p_quote_id
       AND q.organization_id = p_organization_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_quote_appointment IS NOT NULL THEN
      RAISE EXCEPTION 'quote_already_booked' USING ERRCODE = '23505';
    END IF;
    IF v_quote_status <> 'accepted' THEN
      RAISE EXCEPTION 'quote_not_accepted' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_lead_id := COALESCE(p_lead_id, v_quote_lead);
  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads AS l
      (organization_id, name, email, phone, service_id, source, status, estimated_value)
    VALUES
      (p_organization_id, p_name, p_email, p_phone, p_service_id, 'manual', 'booked',
       COALESCE(p_estimated_value, 0))
    RETURNING l.id INTO v_lead_id;
  ELSE
    UPDATE public.leads AS l
       SET status = 'booked'
     WHERE l.id = v_lead_id
       AND l.organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.appointments AS a
    (organization_id, lead_id, service_id, name, email, phone, starts_at, ends_at, status, notes)
  VALUES
    (p_organization_id, v_lead_id, p_service_id, p_name, p_email, p_phone, p_starts_at, p_ends_at,
     COALESCE(p_status, 'confirmed'), p_notes)
  RETURNING a.id INTO v_appointment_id;

  INSERT INTO public.lead_activities (organization_id, lead_id, appointment_id, kind, body)
  VALUES (p_organization_id, v_lead_id, v_appointment_id, 'booked', left(COALESCE(p_activity_body, ''), 500));

  IF p_quote_id IS NOT NULL THEN
    UPDATE public.quotes AS q
       SET appointment_id = v_appointment_id,
           lead_id = COALESCE(q.lead_id, v_lead_id)
     WHERE q.id = p_quote_id
       AND q.organization_id = p_organization_id
       AND q.appointment_id IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'quote_already_booked' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN jsonb_build_object('appointment_id', v_appointment_id, 'lead_id', v_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.book_appointment(uuid, text, text, text, timestamptz, timestamptz, uuid, text, uuid, public.appointment_status, numeric, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_appointment(uuid, text, text, text, timestamptz, timestamptz, uuid, text, uuid, public.appointment_status, numeric, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, text, text, text, timestamptz, timestamptz, uuid, text, uuid, public.appointment_status, numeric, uuid, text) TO authenticated, service_role;
