import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** JC-21: recorded quality-gate scores per recent site. Super admins only, read-only. */
export const getGateScoreboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { collectGateScoreboard } = await import("./gate-scoreboard.server");
    return collectGateScoreboard(supabaseAdmin);
  });
