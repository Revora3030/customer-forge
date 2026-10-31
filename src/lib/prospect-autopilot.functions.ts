import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAutopilotPatch } from "./prospect-autopilot";

async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/** Super-admin only: the prospect autopilot settings (off by default). */
export const getProspectAutopilotFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { getAutopilotSettings } = await import("./prospect-autopilot.server");
    return getAutopilotSettings(db);
  });

/**
 * Super-admin only: changes the autopilot settings. Only the fields sent are
 * changed. The operator who saves owns the demos autopilot builds next.
 */
export const saveProspectAutopilotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => parseAutopilotPatch(input))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { saveAutopilotSettings } = await import("./prospect-autopilot.server");
    return saveAutopilotSettings(db, data, String(context.userId));
  });

/** Super-admin only: runs one autopilot pass now (still off while autopilot is switched off). */
export const runProspectAutopilotNowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const origin = new URL(getRequest().url).origin;
    const { runProspectAutopilot } = await import("./prospect-autopilot.server");
    const { runInBackground } = await import("@/lib/background.server");
    const { kickWorker } = await import("@/lib/site-engine.functions");
    return runProspectAutopilot(db, {
      trigger: "manual",
      onQueued: (organizationId) => runInBackground(() => kickWorker(origin, organizationId)),
    });
  });

/**
 * Super-admin only: the prospect engine funnel (discovered → converted), in
 * total and today (UTC), by state. Read-only; unreadable sources come back
 * as unknown stages, never zero.
 */
export const getEngineFunnelFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { getEngineFunnel } = await import("./engine-funnel.server");
    return getEngineFunnel(db);
  });

/** Super-admin only: recent autopilot runs, newest first. */
export const listAutopilotRunsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { listAutopilotRuns } = await import("./prospect-autopilot.server");
    return listAutopilotRuns(db, 10);
  });

/**
 * Super-admin only: the mailing address outreach emails must carry (the value of
 * the REVORA_MAILING_ADDRESS env var), or null when it isn't set.
 */
export const getOutreachMailingAddressFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guardedAdmin(context);
    const { mailingAddress } = await import("./gmail/client.server");
    return { address: mailingAddress() || null };
  });
