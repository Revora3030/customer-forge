ALTER TABLE public.website_visual_reports ADD COLUMN IF NOT EXISTS revision_hash text;
CREATE INDEX IF NOT EXISTS website_visual_reports_org_revision ON public.website_visual_reports (organization_id, revision_hash);

CREATE OR REPLACE FUNCTION private.site_revision_hash(_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','private' AS $$
  SELECT md5(
    COALESCE((SELECT string_agg(p.id::text || ':' || md5(to_jsonb(p)::text), ',' ORDER BY p.id) FROM public.website_pages p WHERE p.organization_id = _org), '') || '|' ||
    COALESCE((SELECT string_agg(s.id::text || ':' || md5(to_jsonb(s)::text), ',' ORDER BY s.id) FROM public.website_sections s WHERE s.organization_id = _org), '') || '|' ||
    COALESCE((SELECT string_agg(c.id::text || ':' || md5(to_jsonb(c)::text), ',' ORDER BY c.id) FROM public.website_components c WHERE c.organization_id = _org), '')
  )
$$;
REVOKE ALL ON FUNCTION private.site_revision_hash(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.stamp_visual_report_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $$
BEGIN
  NEW.revision_hash := private.site_revision_hash(NEW.organization_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.stamp_visual_report_revision() FROM PUBLIC;

DROP TRIGGER IF EXISTS stamp_visual_report_revision ON public.website_visual_reports;
CREATE TRIGGER stamp_visual_report_revision BEFORE INSERT OR UPDATE ON public.website_visual_reports
FOR EACH ROW EXECUTE FUNCTION private.stamp_visual_report_revision();

CREATE OR REPLACE FUNCTION private.guard_production_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
DECLARE
  going_live boolean;
  domain_live boolean;
  image_status text;
  current_rev text;
BEGIN
  IF current_setting('role', true) = 'service_role' OR private.is_super_admin() THEN
    RETURN NEW;
  END IF;
  going_live := COALESCE(NEW.published, false) OR NEW.publish_state = 'published';
  domain_live := COALESCE(NEW.domain_verified, false) OR COALESCE(NEW.ssl_active, false) OR NEW.domain_status IN ('connected','ssl_active');
  IF TG_OP = 'UPDATE' THEN
    going_live := going_live AND NOT (COALESCE(OLD.published, false) OR OLD.publish_state = 'published');
    domain_live := domain_live AND NOT (COALESCE(OLD.domain_verified, false) OR COALESCE(OLD.ssl_active, false) OR OLD.domain_status IN ('connected','ssl_active'));
  END IF;
  IF (going_live OR domain_live) AND NOT private.production_unlocked(NEW.organization_id) THEN
    RAISE EXCEPTION 'PRODUCTION_LOCKED: Complete your one-time $750 setup to publish your website and activate your live domain. Your build, settings and version history stay saved.';
  END IF;
  IF going_live THEN
    image_status := COALESCE(NEW.generation #>> '{report,imagery,generatedStatus}', '');
    current_rev := private.site_revision_hash(NEW.organization_id);
    IF NEW.generated_at IS NULL
       OR NEW.generation -> 'firstBuildCreative' IS NULL
       OR image_status NOT IN ('generated','owner_photos')
       OR NEW.review_state <> 'approved'
       OR NOT EXISTS (
         SELECT 1 FROM public.website_visual_reports r
          WHERE r.organization_id = NEW.organization_id
            AND r.revision_hash = current_rev)
       OR EXISTS (
         SELECT 1 FROM public.website_visual_reports r
          WHERE r.organization_id = NEW.organization_id
            AND r.revision_hash = current_rev
            AND COALESCE((r.report ->> 'passed')::boolean, false) = false
            AND r.measured_at = (SELECT max(r2.measured_at) FROM public.website_visual_reports r2
                                  WHERE r2.organization_id = r.organization_id AND r2.page_slug IS NOT DISTINCT FROM r.page_slug AND r2.revision_hash = current_rev)) THEN
      RAISE EXCEPTION 'PRODUCTION_EVIDENCE_REQUIRED: Run the visual quality check on the current version of every page and fix any failures before publishing.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.guard_production_activation() FROM PUBLIC;