import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Runs the site-health and content-audit sentinels once, for the owner. */
export const runSentinelSweepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runSiteHealth } = await import("@/lib/owner-reports.server");
    const { runSiteContentAudit } = await import("@/lib/site-content-audit.server");
    const health = await runSiteHealth(supabaseAdmin);
    const audit = await runSiteContentAudit(supabaseAdmin);
    return {
      sitesChecked: health.scanned,
      sitesDown: health.down.length,
      pagesAudited: audit.scanned,
      pagesWithProblems: audit.withProblems,
    };
  });
