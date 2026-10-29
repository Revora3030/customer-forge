-- Review queue for leads imported from a CSV (for example the sheet the Grok
-- bots fill). A row waits here as 'pending' until the owner approves it; only
-- approval hands it to the prospect pipeline (demo workspace, verified email,
-- the autopilot's own send gates). Importing never contacts anyone.
--
-- notes, source and contact_name come from outside and are shown as plain text
-- only. They are never given to a model and never used to write an email.
--
-- Additive and service-role only: RLS on with no policies, no anon or
-- authenticated access.

CREATE TABLE IF NOT EXISTS public.prospect_import_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  category TEXT,
  city TEXT NOT NULL,
  state TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  source TEXT,
  score INTEGER CHECK (score BETWEEN 1 AND 10),
  notes TEXT,
  -- Duplicate keys: business name + city, last ten digits of the phone, real website host.
  name_key TEXT NOT NULL,
  phone_key TEXT,
  site_host TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'releasing', 'approved', 'rejected', 'blocked')),
  blocked_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  -- The demo workspace created when the lead was approved.
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT prospect_import_queue_pkey PRIMARY KEY (id)
);

-- One queue row per business in a city, so two imports (or two taps) cannot queue it twice.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_import_queue_name_key_idx
  ON public.prospect_import_queue (name_key);
CREATE INDEX IF NOT EXISTS prospect_import_queue_review_idx
  ON public.prospect_import_queue (status, score DESC NULLS LAST, created_at);

ALTER TABLE public.prospect_import_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_import_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.prospect_import_queue TO service_role;
