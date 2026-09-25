CREATE TABLE public.public_submission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 2 AND 80),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ip_hash text NOT NULL CHECK (char_length(ip_hash) BETWEEN 16 AND 128),
  contact_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.public_submission_attempts TO service_role;

ALTER TABLE public.public_submission_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX public_submission_attempts_ip_window_idx
  ON public.public_submission_attempts (purpose, organization_id, ip_hash, created_at DESC);

CREATE INDEX public_submission_attempts_contact_window_idx
  ON public.public_submission_attempts (purpose, organization_id, contact_hash, created_at DESC)
  WHERE contact_hash IS NOT NULL;

CREATE INDEX public_submission_attempts_created_idx
  ON public.public_submission_attempts (created_at DESC);