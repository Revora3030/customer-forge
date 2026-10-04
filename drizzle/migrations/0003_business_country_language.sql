-- Global readiness: where the business trades and which language its website
-- is written in. Both are optional; NULL keeps the previous behaviour.
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS site_language text;

DO $$
BEGIN
  ALTER TABLE public.business_profiles
    ADD CONSTRAINT business_profiles_country_format
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.business_profiles
    ADD CONSTRAINT business_profiles_site_language_length
    CHECK (site_language IS NULL OR char_length(site_language) BETWEEN 2 AND 40);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Public site rendering may read the language (for <html lang>) and country.
GRANT SELECT (country, site_language) ON public.business_profiles TO anon;

-- Same columns as before plus country/site_language, appended at the end so
-- CREATE OR REPLACE keeps existing column order.
CREATE OR REPLACE VIEW public.public_business_profiles
WITH (security_invoker = true) AS
SELECT
  id, organization_id, tagline, description, phone, email, website,
  address, city, state, zip, service_area, hours, logo_url, hero_image_url,
  primary_color, secondary_color, accent_color, font_preference, review_link,
  country, site_language
FROM public.business_profiles;

GRANT SELECT ON public.public_business_profiles TO anon, authenticated;
