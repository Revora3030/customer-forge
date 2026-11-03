-- Speed to lead (Lovable round 10, item 6).
--
-- leads.first_response_at: when someone first answered the lead. Set by the
--   database, not the browser: the first call / email / text activity logged
--   for the lead, or the first time the lead is marked contacted
--   (last_contacted_at set or status moved to 'contacted'). Once set it never
--   changes.
-- leads.response_escalated_at: when the 5-minute "still waiting" escalation
--   went to the owner's inboxes, so it goes out at most once per lead. Written
--   only by the service-role escalation job.
--
-- Additive only (nothing removed). Row access stays with the existing org-scoped leads
-- policies (private.is_org_member); no new table or policy is needed.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS response_escalated_at timestamptz;

COMMENT ON COLUMN public.leads.first_response_at IS
  'First call/email/text logged for the lead, or first time it was marked contacted. Set by trigger; immutable once set.';
COMMENT ON COLUMN public.leads.response_escalated_at IS
  'When the 5-minute no-reply escalation was sent (service role only). At most once per lead.';

-- Leads still waiting for a first reply, newest first: what the escalation job scans.
CREATE INDEX IF NOT EXISTS leads_awaiting_first_response_idx
  ON public.leads (created_at DESC)
  WHERE first_response_at IS NULL AND response_escalated_at IS NULL;

-- Guard: browsers cannot write either column directly. first_response_at is
-- stamped from a contact signal (or by the activity trigger below) and then
-- frozen; response_escalated_at is service-role only.
CREATE OR REPLACE FUNCTION private.guard_lead_first_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  trusted boolean := current_setting('role', true) = 'service_role'
    OR current_setting('revora.first_response', true) = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT trusted THEN
      NEW.first_response_at := NULL;
      NEW.response_escalated_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.first_response_at IS NOT NULL THEN
    NEW.first_response_at := OLD.first_response_at;
  ELSIF NOT trusted THEN
    NEW.first_response_at := NULL;
    IF (NEW.last_contacted_at IS NOT NULL AND NEW.last_contacted_at IS DISTINCT FROM OLD.last_contacted_at)
       OR (NEW.status = 'contacted' AND OLD.status = 'new') THEN
      NEW.first_response_at := now();
    END IF;
  END IF;

  IF NOT trusted THEN
    NEW.response_escalated_at := OLD.response_escalated_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_lead_first_response() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_lead_first_response() TO service_role;

CREATE OR REPLACE TRIGGER leads_guard_first_response
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION private.guard_lead_first_response();

-- A logged call, email or text answers the lead (same kinds as speed-to-lead.ts).
CREATE OR REPLACE FUNCTION private.stamp_lead_first_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.kind IN ('call', 'email', 'text') THEN
    PERFORM set_config('revora.first_response', 'on', true);
    UPDATE public.leads
       SET first_response_at = GREATEST(NEW.created_at, created_at)
     WHERE id = NEW.lead_id
       AND organization_id = NEW.organization_id
       AND first_response_at IS NULL;
    PERFORM set_config('revora.first_response', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_lead_first_response() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.stamp_lead_first_response() TO service_role;

CREATE OR REPLACE TRIGGER lead_activities_stamp_first_response
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION private.stamp_lead_first_response();

-- Backfill from existing records, earliest signal first. The session flag lets
-- the guard accept the stamped values; it is switched off again right after.
SELECT set_config('revora.first_response', 'on', false);
UPDATE public.leads l
   SET first_response_at = first_contact.at
  FROM (
    SELECT a.lead_id, min(a.created_at) AS at
      FROM public.lead_activities a
      JOIN public.leads x ON x.id = a.lead_id AND x.organization_id = a.organization_id
     WHERE a.kind IN ('call', 'email', 'text') AND a.created_at >= x.created_at
     GROUP BY a.lead_id
  ) AS first_contact
 WHERE l.id = first_contact.lead_id AND l.first_response_at IS NULL;
UPDATE public.leads
   SET first_response_at = last_contacted_at
 WHERE first_response_at IS NULL AND last_contacted_at IS NOT NULL AND last_contacted_at >= created_at;
SELECT set_config('revora.first_response', 'off', false);

-- Column privileges follow the existing table grants; restated explicitly.
GRANT SELECT (first_response_at, response_escalated_at) ON public.leads TO authenticated;
GRANT SELECT (first_response_at, response_escalated_at), UPDATE (first_response_at, response_escalated_at) ON public.leads TO service_role;
