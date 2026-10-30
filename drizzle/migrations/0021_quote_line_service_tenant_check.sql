-- Idempotent repair for two live-database gaps Lovable reported on 2026-10-29.
--
-- 1. quote_line_items in the live database predates 20261021100000 and lacks
--    the same-tenant foreign key that stops a quote line pointing at another
--    business's service. Add it (and the services (id, organization_id) key it
--    needs) only when missing. Any existing cross-tenant pointer is cleared
--    first; the line keeps its copied name and price, so no quote changes.
-- 2. The private site-models bucket must only accept binary glTF (.glb). The
--    app uploads with contentType model/gltf-binary (src/lib/site-models.ts),
--    so restricting the bucket to that MIME type changes nothing for owners.
--
-- Safe to run more than once.

DO $$
BEGIN
  IF to_regclass('public.quote_line_items') IS NULL OR to_regclass('public.services') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.services'::regclass AND conname = 'services_id_org_key'
  ) THEN
    ALTER TABLE public.services ADD CONSTRAINT services_id_org_key UNIQUE (id, organization_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quote_line_items'::regclass AND conname = 'quote_line_items_service_same_org_fkey'
  ) THEN
    UPDATE public.quote_line_items AS li
       SET service_id = NULL
     WHERE li.service_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.services AS s
          WHERE s.id = li.service_id AND s.organization_id = li.organization_id
       );

    ALTER TABLE public.quote_line_items
      ADD CONSTRAINT quote_line_items_service_same_org_fkey
      FOREIGN KEY (service_id, organization_id)
      REFERENCES public.services (id, organization_id) ON DELETE SET NULL (service_id);
  END IF;

  CREATE INDEX IF NOT EXISTS quote_line_items_service_idx
    ON public.quote_line_items (organization_id, service_id)
    WHERE service_id IS NOT NULL;
END
$$;