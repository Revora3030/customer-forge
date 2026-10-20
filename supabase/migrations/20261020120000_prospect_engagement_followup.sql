-- One engagement follow-up email per prospect demo.
--
-- When a prospect opened its private preview at least twice (or from two
-- sessions) after the first autopilot email, at least 48 hours ago, and never
-- replied or claimed, autopilot queues ONE factual follow-up (the preview link,
-- the claim link and the CAN-SPAM footer). It goes through the same
-- sendDemoOutreach safeguards as every send: do-not-contact, the launch gate,
-- the daily cap and business hours.
--
-- 1. prospect_outreach.kind gains 'followup'. The named CHECK is dropped and
--    recreated (guarded), so re-running this file is harmless.
-- 2. A partial unique index makes "one sent autopilot follow-up per demo per
--    channel" a database guarantee across overlapping runs and drains.
-- 3. prospect_outreach_auto_reply_seq_check is unchanged and stays valid:
--    follow-ups are not replies, so their auto_reply_seq is NULL.
-- 4. prospect_send_queue.kind tells the drain a queued item is the follow-up.
--    Existing rows are first touches (the default).
-- Additive and service-role only: no RLS or grant changes.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospect_outreach_kind_check') THEN
    ALTER TABLE public.prospect_outreach DROP CONSTRAINT prospect_outreach_kind_check;
  END IF;
  ALTER TABLE public.prospect_outreach ADD CONSTRAINT prospect_outreach_kind_check
    CHECK (kind IN ('first_touch', 'reply', 'followup'));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_one_autopilot_followup_idx
  ON public.prospect_outreach (organization_id, channel)
  WHERE status = 'sent' AND mode = 'autopilot' AND kind = 'followup';

ALTER TABLE public.prospect_send_queue ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'first_touch';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospect_send_queue_kind_check') THEN
    ALTER TABLE public.prospect_send_queue ADD CONSTRAINT prospect_send_queue_kind_check
      CHECK (kind IN ('first_touch', 'followup'));
  END IF;
END $$;

COMMENT ON COLUMN public.prospect_outreach.kind IS 'first_touch (the preview link), reply (in-thread answer) or followup (the one engagement follow-up email).';
COMMENT ON COLUMN public.prospect_send_queue.kind IS 'first_touch or followup; the drain passes it to sendDemoOutreach.';

COMMIT;
