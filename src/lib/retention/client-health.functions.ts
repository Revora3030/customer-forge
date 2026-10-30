import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Customer health score per client workspace, for the super admin clients list. */
export const getClientHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadClientHealth } = await import("@/lib/retention/health-data.server");
    const rows = await loadClientHealth(supabaseAdmin as never);
    return rows.map((row) => ({
      organizationId: row.organizationId,
      isCustomer: row.isCustomer,
      score: row.health.score,
      band: row.health.band,
      reasons: row.health.reasons.slice(0, 4),
      unknown: row.health.unknown,
    }));
  });
