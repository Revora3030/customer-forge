import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * /admin routing audit: did every recent accepted form reach the right
 * workspace and the right recipient? Super-admin only, reads stored rows only
 * (no email, no SMS, no writes). Findings carry workspace names, ages and
 * masked addresses, never a lead's name, email or phone.
 */
export const getLeadDeliveryAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const { loadLeadDeliveryAudit } = await import("@/lib/lead-delivery-audit.server");
    const report = await loadLeadDeliveryAudit(db);
    // Cap what the browser receives; the counts still cover everything.
    return { ...report, findings: report.findings.slice(0, 50), truncated: report.findings.length > 50 };
  });
