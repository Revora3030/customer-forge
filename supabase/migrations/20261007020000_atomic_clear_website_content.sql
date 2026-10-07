-- Atomic cleanup boundary for a full AI rebuild.
-- Only the server's service_role may call this SECURITY DEFINER function.
-- RLS is not weakened for browser roles and no tenant id is derived from client input.

BEGIN;

CREATE OR REPLACE FUNCTION public.clear_website_content(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  deleted_components integer := 0;
  deleted_sections integer := 0;
  deleted_pages integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization id is required';
  END IF;

  DELETE FROM public.website_components
   WHERE organization_id = p_org_id;
  GET DIAGNOSTICS deleted_components = ROW_COUNT;

  DELETE FROM public.website_sections
   WHERE organization_id = p_org_id;
  GET DIAGNOSTICS deleted_sections = ROW_COUNT;

  DELETE FROM public.website_pages
   WHERE organization_id = p_org_id;
  GET DIAGNOSTICS deleted_pages = ROW_COUNT;

  RETURN jsonb_build_object(
    'components', deleted_components,
    'sections', deleted_sections,
    'pages', deleted_pages
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_website_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_website_content(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_website_content(uuid) TO service_role;

COMMIT;
