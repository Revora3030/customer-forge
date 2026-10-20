ALTER TABLE public.prospect_outreach DROP CONSTRAINT prospect_outreach_kind_check;
ALTER TABLE public.prospect_outreach ADD CONSTRAINT prospect_outreach_kind_check CHECK (kind = ANY (ARRAY['first_touch'::text, 'reply'::text, 'follow_up'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_one_follow_up_idx ON public.prospect_outreach (organization_id, channel) WHERE status = 'sent' AND kind = 'follow_up';
ALTER TABLE public.prospect_send_queue ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'first_touch';
ALTER TABLE public.prospect_send_queue ADD CONSTRAINT prospect_send_queue_kind_check CHECK (kind = ANY (ARRAY['first_touch'::text, 'follow_up'::text]));