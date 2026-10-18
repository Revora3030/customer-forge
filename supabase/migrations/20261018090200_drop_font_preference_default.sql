-- Typography is an AI decision, not a platform default.
--
-- business_profiles.font_preference was created with DEFAULT 'Space Grotesk',
-- so every new profile looked like an owner request for that typeface and the
-- AI's own font pairing was never used. Drop the default (the same pattern the
-- colour defaults followed in 20260924004902).
ALTER TABLE public.business_profiles ALTER COLUMN font_preference DROP DEFAULT;

-- Clear the bare platform default only where it cannot be an owner's live
-- choice: organisations that have never published, excluding the seeded demo
-- workspace (11111111-1111-4111-8111-111111111111, see 20260828194005). A font
-- the owner typed, a font pair ("A | B") or any other value is left alone.
-- Idempotent: a second run matches nothing.
UPDATE public.business_profiles bp
SET font_preference = NULL
WHERE bp.font_preference = 'Space Grotesk'
  AND bp.organization_id <> '11111111-1111-4111-8111-111111111111'
  AND NOT EXISTS (
    SELECT 1
    FROM public.website_settings ws
    WHERE ws.organization_id = bp.organization_id
      AND ws.published = true
  );
