/**
 * B12-7: read an uploaded menu/price sheet into PROPOSED services. This call
 * never saves a service; the owner confirms each proposal in the app.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IngestPreview } from "@/lib/doc-ingest/doc-ingest";

export const readMenuDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        path: z.string().min(1).max(200),
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<IngestPreview> => {
    const { readIngestDocument } = await import("@/lib/doc-ingest/doc-ingest.server");
    return readIngestDocument(context.supabase, String(context.userId), data);
  });
