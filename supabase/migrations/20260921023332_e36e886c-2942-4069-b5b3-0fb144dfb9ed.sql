ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_page text,
  ADD COLUMN IF NOT EXISTS license text,
  ADD COLUMN IF NOT EXISTS license_url text,
  ADD COLUMN IF NOT EXISTS attribution text,
  ADD COLUMN IF NOT EXISTS creator text;

COMMENT ON COLUMN public.media.source IS 'Where the picture came from: upload, generated, or a stock library name.';
COMMENT ON COLUMN public.media.license IS 'Licence code recorded for stock pictures, e.g. cc0, by, by-sa.';
COMMENT ON COLUMN public.media.attribution IS 'Exact credit line required by the licence.';