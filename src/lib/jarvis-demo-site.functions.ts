import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseProspectDemoInput } from "./jarvis-demo-site";

async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/**
 * Super-admin only: builds a private demo website for a business that has no
 * website yet. Creates a demo workspace, queues the normal AI first build and
 * returns a 30-day private preview link. Nothing is published or sent.
 */
export const startProspectDemoBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => parseProspectDemoInput(input))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { provisionProspectDemo } = await import("./jarvis-demo-site.server");
    const result = await provisionProspectDemo(db, data, String(context.userId));

    const origin = new URL(getRequest().url).origin;
    const { runInBackground } = await import("@/lib/background");
    const { kickWorker } = await import("@/lib/site-engine.functions");
    runInBackground(() => kickWorker(origin, result.organizationId));

    return { ...result, previewPath: `/p/${result.previewToken}` };
  });

export const listProspectDemoBuilds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { listProspectDemos } = await import("./jarvis-demo-site.server");
    return listProspectDemos(db);
  });
