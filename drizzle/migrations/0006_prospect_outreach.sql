CREATE TABLE public.prospect_outreach_autopilot (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  daily_cap integer NOT NULL DEFAULT 40 CHECK (daily_cap BETWEEN 1 AND 40),
  owner_id uuid,
  last_run_at timestamptz,
  last_result jsonb,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.prospect_outreach_autopilot TO service_role;
ALTER TABLE public.prospect_outreach_autopilot ENABLE ROW LEVEL SECURITY;
INSERT INTO public.prospect_outreach_autopilot (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.prospect_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','failed')),
  gmail_message_id text,
  error text,
  source text NOT NULL CHECK (source IN ('manual','autopilot')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX prospect_outreach_email_once ON public.prospect_outreach (lower(email)) WHERE status <> 'failed';
CREATE INDEX prospect_outreach_created ON public.prospect_outreach (created_at DESC);
GRANT ALL ON public.prospect_outreach TO service_role;
ALTER TABLE public.prospect_outreach ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.prospect_outreach_suppressions (
  email text PRIMARY KEY CHECK (email = lower(email)),
  reason text NOT NULL DEFAULT 'opted_out',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.prospect_outreach_suppressions TO service_role;
ALTER TABLE public.prospect_outreach_suppressions ENABLE ROW LEVEL SECURITY;