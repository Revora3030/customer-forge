-- Builder chat work (plan / apply) that keeps running on the server when the
-- owner's phone leaves the app. Additive only. Rows are written by the service
-- role; the requesting user may read their own rows to pick up the result.
CREATE TABLE IF NOT EXISTS public.builder_chat_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan', 'apply')),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  fence integer NOT NULL DEFAULT 0,
  worker text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (organization_id, kind, request_key)
);

GRANT SELECT ON public.builder_chat_jobs TO authenticated;
GRANT ALL ON public.builder_chat_jobs TO service_role;

ALTER TABLE public.builder_chat_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS builder_chat_jobs_own_read ON public.builder_chat_jobs;
CREATE POLICY builder_chat_jobs_own_read ON public.builder_chat_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND private.is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS builder_chat_jobs_org_created_idx ON public.builder_chat_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS builder_chat_jobs_user_idx ON public.builder_chat_jobs (user_id);
CREATE INDEX IF NOT EXISTS builder_chat_jobs_open_idx ON public.builder_chat_jobs (status, lease_expires_at) WHERE status IN ('queued', 'running');

-- Single-flight claim: a queued job, or a running one whose worker went quiet
-- (lease expired) and has not already been retried. Returns the claimed row.
CREATE OR REPLACE FUNCTION public.builder_chat_job_claim(_id uuid, _worker text, _lease_seconds integer DEFAULT 120)
RETURNS SETOF public.builder_chat_jobs
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.builder_chat_jobs;
BEGIN
  UPDATE public.builder_chat_jobs
     SET status = 'running', worker = left(_worker, 80), fence = fence + 1, attempts = attempts + 1,
         lease_expires_at = now() + make_interval(secs => greatest(30, _lease_seconds)), updated_at = now()
   WHERE id = _id
     AND (status = 'queued' OR (status = 'running' AND lease_expires_at < now() AND attempts < 2))
  RETURNING * INTO r;
  IF FOUND THEN RETURN NEXT r; END IF;
END $$;

REVOKE ALL ON FUNCTION public.builder_chat_job_claim(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.builder_chat_job_claim(uuid, text, integer) TO service_role;