CREATE OR REPLACE FUNCTION public.set_prospect_demo_enrichment(p_organization_id UUID, p_enrichment JSONB)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.website_settings w
  SET generation = jsonb_set(w.generation, '{prospectDemo,enrichment}', p_enrichment, true)
  WHERE w.organization_id = p_organization_id
    AND jsonb_typeof(w.generation -> 'prospectDemo') = 'object'
    AND (w.generation -> 'prospectDemo' -> 'enrichment') IS NULL
    AND NOT (w.generation -> 'prospectDemo' ? 'claimedAt')
    AND jsonb_typeof(p_enrichment) = 'object'
  RETURNING w.organization_id;
$$;
REVOKE ALL ON FUNCTION public.set_prospect_demo_enrichment(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_prospect_demo_enrichment(UUID, JSONB) TO service_role;
COMMENT ON FUNCTION public.set_prospect_demo_enrichment(UUID, JSONB) IS 'Sets only generation.prospectDemo.enrichment for an unclaimed demo with no record yet; returns the org id when written.';