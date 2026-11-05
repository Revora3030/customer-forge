-- COMP-12 (free part): AI-answer visibility log. The owner pastes five
-- generated prompts into any AI assistant and records, once a month, whether
-- their business was mentioned. Owner-entered only; nothing here is measured
-- or queried automatically (the automated, paid part is not built).
-- Additive and idempotent: IF NOT EXISTS, policies created only when missing,
-- no DROP, no row changes, no pg_cron job.

CREATE TABLE IF NOT EXISTS public.ai_visibility_checks (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  prompt_index smallint NOT NULL CHECK (prompt_index BETWEEN 0 AND 4),
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 5 AND 300),
  mentioned boolean NOT NULL,
  recorded_by uuid DEFAULT auth.uid(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, month, prompt_index)
);

ALTER TABLE public.ai_visibility_checks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_visibility_checks FROM PUBLIC;
REVOKE ALL ON public.ai_visibility_checks FROM anon;
REVOKE ALL ON public.ai_visibility_checks FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_visibility_checks TO authenticated;
GRANT ALL ON public.ai_visibility_checks TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_visibility_checks' AND policyname = 'ai_visibility_checks_member_select') THEN
    CREATE POLICY ai_visibility_checks_member_select ON public.ai_visibility_checks
      FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_visibility_checks' AND policyname = 'ai_visibility_checks_member_insert') THEN
    CREATE POLICY ai_visibility_checks_member_insert ON public.ai_visibility_checks
      FOR INSERT TO authenticated WITH CHECK (private.is_org_member(organization_id) AND recorded_by = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_visibility_checks' AND policyname = 'ai_visibility_checks_member_update') THEN
    CREATE POLICY ai_visibility_checks_member_update ON public.ai_visibility_checks
      FOR UPDATE TO authenticated USING (private.is_org_member(organization_id)) WITH CHECK (private.is_org_member(organization_id) AND recorded_by = (SELECT auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_visibility_checks' AND policyname = 'ai_visibility_checks_member_delete') THEN
    CREATE POLICY ai_visibility_checks_member_delete ON public.ai_visibility_checks
      FOR DELETE TO authenticated USING (private.is_org_member(organization_id));
  END IF;
END
$$;
