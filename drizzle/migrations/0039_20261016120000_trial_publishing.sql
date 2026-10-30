-- Trial publishing.
--
-- A workspace may now publish its site on its Revora address during the free
-- full-access trial. The site is served while the trial lasts; when the trial
-- ends without the setup payment it goes offline (nothing is deleted) and
-- comes back when the setup is paid. Custom domains stay paid-only.
-- The application applies the same rule in src/lib/site-access.ts.

CREATE OR REPLACE FUNCTION private.site_live_allowed(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.production_unlocked(_org) OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = _org
      AND NOT o.is_suspended
      AND greatest(
            coalesce(o.trial_ends_at, '-infinity'::timestamptz),
            coalesce(o.created_at + interval '3 days', '-infinity'::timestamptz)
          ) >= now()
  )
$function$;

REVOKE ALL ON FUNCTION private.site_live_allowed(uuid) FROM PUBLIC;

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
  -- Custom domains stay paid-only.
  IF domain_live AND NOT private.production_unlocked(NEW.organization_id) THEN
    RAISE EXCEPTION 'PRODUCTION_LOCKED: Complete your one-time $350 setup to activate your custom domain. Your build, settings and version history stay saved.';
  END IF;
  -- Publishing on the Revora address is also allowed during the free trial.
  IF going_live AND NOT private.site_live_allowed(NEW.organization_id) THEN
    RAISE EXCEPTION 'PRODUCTION_LOCKED: Your free trial has ended. Complete your one-time $350 setup to publish your website. Your build, settings and version history stay saved.';
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
