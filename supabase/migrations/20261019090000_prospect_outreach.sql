-- Outreach for Jarvis prospect demo sites.
--
-- When a demo build finishes, the operator (or the prospect autopilot) can send
-- the business its private preview link by email or text. Every attempt is
-- recorded in prospect_outreach, including the ones the safeguards stopped
-- (skipped, with the reason). The do-not-contact list is checked before every
-- send; unsubscribe links and inbound STOP replies add to it. Texts from the
-- autopilot need recorded consent (prospect_contact_consent.sms).
--
-- The partial unique index makes "one autopilot send per demo per channel" a
-- database guarantee, so two overlapping autopilot runs can never both send.
-- Additive and service-role only: RLS on with no policies, no anon or
-- authenticated access.

CREATE TABLE IF NOT EXISTS public.prospect_outreach (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  reason TEXT,
  provider_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'autopilot')),
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_outreach_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_one_autopilot_send_idx
  ON public.prospect_outreach (organization_id, channel)
  WHERE status = 'sent' AND mode = 'autopilot';
CREATE INDEX IF NOT EXISTS prospect_outreach_org_created_idx
  ON public.prospect_outreach (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prospect_outreach_channel_created_idx
  ON public.prospect_outreach (channel, created_at DESC)
  WHERE status = 'sent';

CREATE TABLE IF NOT EXISTS public.prospect_do_not_contact (
  value TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_do_not_contact_pkey PRIMARY KEY (value)
);

CREATE TABLE IF NOT EXISTS public.prospect_contact_consent (
  value TEXT NOT NULL,
  sms BOOLEAN NOT NULL DEFAULT false,
  email BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_contact_consent_pkey PRIMARY KEY (value)
);

CREATE TABLE IF NOT EXISTS public.prospect_outreach_unsubscribe_tokens (
  token TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospect_outreach_unsubscribe_tokens_pkey PRIMARY KEY (token)
);

ALTER TABLE public.prospect_outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_do_not_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_contact_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_outreach_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_outreach FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.prospect_do_not_contact FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.prospect_contact_consent FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.prospect_outreach_unsubscribe_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.prospect_outreach TO service_role;
GRANT ALL ON public.prospect_do_not_contact TO service_role;
GRANT ALL ON public.prospect_contact_consent TO service_role;
GRANT ALL ON public.prospect_outreach_unsubscribe_tokens TO service_role;
