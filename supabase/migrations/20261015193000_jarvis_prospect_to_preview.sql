-- Jarvis prospect-to-preview acquisition pipeline.
-- Business data is private to platform operators; customer/anonymous clients get no direct access.
CREATE TABLE IF NOT EXISTS public.jarvis_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 160),
  category text NOT NULL DEFAULT '' CHECK (char_length(category) <= 120),
  city text NOT NULL DEFAULT '' CHECK (char_length(city) <= 120),
  region text NOT NULL DEFAULT '' CHECK (char_length(region) <= 120),
  country_code text NOT NULL DEFAULT 'US' CHECK (char_length(country_code) = 2),
  place_id text,
  phone text,
  email text,
  website_url text,
  website_status text NOT NULL DEFAULT 'unverified' CHECK (website_status IN ('unverified','no_website_listed','website_found','website_unreachable','needs_review')),
  website_checked_at timestamptz,
  lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(evidence::text) <= 12000),
  status text NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered','verified','brief_ready','building','qa_failed','preview_ready','contact_approved','contacted','replied','won','lost','suppressed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','google_places','directory','referral','inbound')),
  source_url text,
  suppression_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, place_id)
);
CREATE INDEX IF NOT EXISTS jarvis_prospects_status_score_idx ON public.jarvis_prospects(status, lead_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_prospects_name_city_idx ON public.jarvis_prospects(lower(business_name), lower(city));
CREATE INDEX IF NOT EXISTS jarvis_prospects_website_status_idx ON public.jarvis_prospects(website_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_acquisition_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.jarvis_prospects(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('research','brief','site_build','site_qa','preview','handoff')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','awaiting_approval','succeeded','failed','cancelled')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 5),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 180),
  input jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(input::text) <= 24000),
  output jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(output::text) <= 24000),
  error_code text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_jobs_status_idx ON public.jarvis_acquisition_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_jobs_prospect_idx ON public.jarvis_acquisition_jobs(prospect_id, created_at DESC);

ALTER TABLE public.jarvis_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_acquisition_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jarvis_prospects FROM anon, authenticated;
REVOKE ALL ON public.jarvis_acquisition_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jarvis_prospects TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.jarvis_acquisition_jobs TO service_role;
COMMENT ON TABLE public.jarvis_prospects IS 'Private Jarvis prospect pipeline; source evidence and website status are signals, not proof of owner intent.';
COMMENT ON TABLE public.jarvis_acquisition_jobs IS 'Durable idempotent Jarvis research/build/QA/handoff jobs. External outreach and publishing require separate authorization.';
