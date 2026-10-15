BEGIN;

-- Prospect-to-preview workflow. Google Places-derived fields are temporary;
-- place IDs may be kept so a saved opportunity can be refreshed from the source.
CREATE TABLE IF NOT EXISTS public.jarvis_acquisition_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  google_place_id text NOT NULL UNIQUE CHECK (char_length(google_place_id) BETWEEN 1 AND 300),
  business_name text NOT NULL DEFAULT '' CHECK (char_length(business_name) <= 200),
  category text NOT NULL DEFAULT '' CHECK (char_length(category) <= 120),
  address text CHECK (address IS NULL OR char_length(address) <= 300),
  city text NOT NULL DEFAULT '' CHECK (char_length(city) <= 120),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 80),
  website text CHECK (website IS NULL OR char_length(website) <= 500),
  website_status text NOT NULL DEFAULT 'not_listed'
    CHECK (website_status IN ('not_listed','listed','verified','unknown','needs_refresh')),
  rating numeric(2,1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  review_count integer CHECK (review_count IS NULL OR review_count >= 0),
  source_data_expires_at timestamptz NOT NULL,
  owner_verified boolean NOT NULL DEFAULT false,
  owner_verified_facts jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(owner_verified_facts::text) <= 12000),
  pipeline_status text NOT NULL DEFAULT 'saved'
    CHECK (pipeline_status IN ('saved','needs_refresh','preview_ready','interest_received','converted','dismissed')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (octet_length(score_reasons::text) <= 4000),
  last_searched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jarvis_acquisition_prospects_owner_created_idx
  ON public.jarvis_acquisition_prospects(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_prospects_pipeline_idx
  ON public.jarvis_acquisition_prospects(pipeline_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_acquisition_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.jarvis_acquisition_prospects(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 1000),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 360),
  composition_tree jsonb NOT NULL CHECK (octet_length(composition_tree::text) <= 220000),
  proposed_services jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(proposed_services::text) <= 6000),
  facts_to_confirm jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(facts_to_confirm::text) <= 6000),
  design_notes text NOT NULL DEFAULT '' CHECK (char_length(design_notes) <= 1800),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_sites_prospect_created_idx
  ON public.jarvis_acquisition_sites(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_sites_status_expiry_idx
  ON public.jarvis_acquisition_sites(status, expires_at);

CREATE TABLE IF NOT EXISTS public.jarvis_acquisition_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.jarvis_acquisition_sites(id) ON DELETE RESTRICT,
  prospect_id uuid NOT NULL REFERENCES public.jarvis_acquisition_prospects(id) ON DELETE RESTRICT,
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 50),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1400),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','converted','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_interests_status_created_idx
  ON public.jarvis_acquisition_interests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_interests_site_created_idx
  ON public.jarvis_acquisition_interests(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.jarvis_acquisition_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id uuid REFERENCES public.jarvis_acquisition_prospects(id) ON DELETE RESTRICT,
  site_id uuid REFERENCES public.jarvis_acquisition_sites(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  outcome text NOT NULL DEFAULT 'info' CHECK (outcome IN ('info','success','blocked','failure')),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 1200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_events_prospect_created_idx
  ON public.jarvis_acquisition_events(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jarvis_acquisition_events_site_created_idx
  ON public.jarvis_acquisition_events(site_id, created_at DESC);

ALTER TABLE public.jarvis_acquisition_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_acquisition_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_acquisition_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_acquisition_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.jarvis_acquisition_prospects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jarvis_acquisition_sites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jarvis_acquisition_interests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jarvis_acquisition_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jarvis_acquisition_prospects TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.jarvis_acquisition_sites TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.jarvis_acquisition_interests TO service_role;
GRANT SELECT, INSERT ON public.jarvis_acquisition_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.jarvis_acquisition_events_id_seq TO service_role;

-- Public preview forms go through the server, which hashes and resolves the
-- bearer token first. This RPC provides an atomic per-site rate limit.
CREATE OR REPLACE FUNCTION public.jarvis_acquisition_submit_interest(
  p_site_id uuid,
  p_contact_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_prospect_id uuid;
  v_interest_id uuid;
  v_recent integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_site_id::text));
  SELECT s.prospect_id INTO v_prospect_id
    FROM public.jarvis_acquisition_sites s
   WHERE s.id = p_site_id AND s.status = 'active' AND s.expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition_preview_unavailable' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.jarvis_acquisition_interests i
   WHERE i.site_id = p_site_id AND i.created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'acquisition_interest_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.jarvis_acquisition_interests
    (site_id, prospect_id, contact_name, email, phone, notes)
  VALUES
    (p_site_id, v_prospect_id, left(trim(p_contact_name), 120),
     lower(left(trim(p_email), 254)), nullif(left(trim(coalesce(p_phone, '')), 50), ''),
     left(trim(coalesce(p_notes, '')), 1400))
  RETURNING id INTO v_interest_id;

  UPDATE public.jarvis_acquisition_prospects
     SET pipeline_status = CASE WHEN pipeline_status = 'converted' THEN pipeline_status ELSE 'interest_received' END,
         updated_at = now()
   WHERE id = v_prospect_id;

  INSERT INTO public.jarvis_acquisition_events
    (prospect_id, site_id, event_type, outcome, summary)
  VALUES (v_prospect_id, p_site_id, 'preview_interest_received', 'success',
          'A business owner submitted a request to discuss the preview.');
  RETURN v_interest_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.jarvis_acquisition_submit_interest(uuid,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jarvis_acquisition_submit_interest(uuid,text,text,text,text)
  TO service_role;

-- Audit evidence may be appended, but never edited or deleted.
CREATE OR REPLACE FUNCTION public.jarvis_acquisition_reject_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Jarvis acquisition events are append-only.' USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.jarvis_acquisition_reject_event_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS jarvis_acquisition_events_append_only ON public.jarvis_acquisition_events;
CREATE TRIGGER jarvis_acquisition_events_append_only
  BEFORE UPDATE OR DELETE ON public.jarvis_acquisition_events
  FOR EACH ROW EXECUTE FUNCTION public.jarvis_acquisition_reject_event_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON public.jarvis_acquisition_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.jarvis_acquisition_events TO service_role;

COMMENT ON TABLE public.jarvis_acquisition_prospects IS
  'Super-admin acquisition prospects. Google Places fields expire and must be refreshed unless independently verified by an owner.';
COMMENT ON TABLE public.jarvis_acquisition_sites IS
  'Token-hash-protected, noindex AI website concepts; this table does not authorize production publishing or billing.';
COMMENT ON TABLE public.jarvis_acquisition_interests IS
  'Public preview conversion requests. Submission never triggers a charge, outreach, or production publish.';
COMMENT ON TABLE public.jarvis_acquisition_events IS
  'Append-only audit trail for prospecting, concept generation, and preview interest.';
COMMIT;
