import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveInput = z.object({
  organizationId: z.string().uuid(),
  trade: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
});
const startInput = z.object({ organizationId: z.string().uuid(), snapshotId: z.string().uuid() });

async function adminContext(supabase: unknown, userId: string) {
  const { assertSuperAdmin } = await import("@/lib/admin.server");
  await assertSuperAdmin(supabase as Parameters<typeof assertSuperAdmin>[0], userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Saved starter snapshots (platform admin only). */
export const listSiteSnapshotsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await adminContext(context.supabase, String(context.userId));
    const { listSnapshots } = await import("./site-snapshots.server");
    return { snapshots: await listSnapshots(admin) };
  });

/** "Save as snapshot": scrub one built site into a reusable starter (platform admin only). */
export const saveSiteSnapshotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminContext(context.supabase, String(context.userId));
    const { saveSnapshotFromSite } = await import("./site-snapshots.server");
    return saveSnapshotFromSite(admin, { ...data, createdBy: String(context.userId) });
  });

/** "Start from snapshot": fill a snapshot into a site that has no pages yet (platform admin only). */
export const startSiteFromSnapshotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => startInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminContext(context.supabase, String(context.userId));
    const { startFromSnapshot } = await import("./site-snapshots.server");
    return startFromSnapshot(admin, data);
  });
