-- Media provenance backfill (data only, idempotent).
--
-- AI pictures saved by Image Studio before it recorded a source were stored
-- with source NULL, so they could be treated as the owner's own work photos.
-- Mark only rows whose file names are the AI naming patterns, then move any
-- AI picture out of the "work" (Completed work) category.
-- Rows that already have a source, and every owner photo, are untouched.

UPDATE public.media
SET source = 'generated'
WHERE source IS NULL
  AND (file_name ILIKE 'ai-%' OR file_name ILIKE 'revora-image%');

UPDATE public.media
SET category = 'other'
WHERE source IN ('generated', 'ai')
  AND category = 'work';
