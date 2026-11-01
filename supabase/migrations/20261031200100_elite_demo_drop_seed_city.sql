-- FIX-EVERYTHING #11: the Elite Mobile Detailing demo org (a TEST account) was seeded with an
-- invented Austin, TX address. The public title builder correctly uses the business's own city,
-- so the seed city leaked into "Elite Mobile Detailing — Austin" on /s/elite-mobile-detailing.
-- Clear the invented location so the title falls back to the business name alone.
-- Data-only, idempotent, touches only the one seed organization.
UPDATE public.business_profiles
SET city = NULL,
    state = NULL,
    zip = NULL,
    address = NULL,
    service_area = NULL,
    description = replace(description, ' across the Austin metro', '')
WHERE organization_id = '11111111-1111-4111-8111-111111111111'
  AND city = 'Austin';

UPDATE public.website_settings
SET seo = seo - 'title' - 'description'
WHERE organization_id = '11111111-1111-4111-8111-111111111111'
  AND seo ->> 'title' ILIKE '%Austin%';
