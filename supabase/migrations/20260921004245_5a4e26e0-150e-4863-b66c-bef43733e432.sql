CREATE TABLE public.builder_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  stage text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX builder_progress_run_idx ON public.builder_progress (organization_id, run_id, created_at);

GRANT SELECT ON public.builder_progress TO authenticated;
GRANT ALL ON public.builder_progress TO service_role;

ALTER TABLE public.builder_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_progress_member_read" ON public.builder_progress
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.organization_id = builder_progress.organization_id
    AND m.user_id = auth.uid()
));