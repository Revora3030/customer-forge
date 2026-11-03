CREATE TABLE public.builder_reply_drafts (
  organization_id uuid NOT NULL,
  run_id text NOT NULL,
  text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, run_id)
);
GRANT SELECT ON public.builder_reply_drafts TO authenticated;
GRANT ALL ON public.builder_reply_drafts TO service_role;
ALTER TABLE public.builder_reply_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "builder_reply_drafts_member_read" ON public.builder_reply_drafts
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.memberships m
  WHERE m.organization_id = builder_reply_drafts.organization_id
    AND m.user_id = auth.uid()
));
CREATE INDEX builder_reply_drafts_updated_idx ON public.builder_reply_drafts (updated_at);