import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** JC-20: one lane per active build job, from stored rows only. Super admins only, read-only. */
export const getPipelineLanes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { collectPipelineLanes } = await import("./pipeline-lanes.server");
    return collectPipelineLanes(supabaseAdmin);
  });
