import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runTestLead } from "@/lib/test-lead.server";

/**
 * Add one labeled test lead to the owner's own dashboard.
 *
 * It runs as the signed-in owner, so workspace access is enforced by RLS. It
 * does NOT email or text the "customer" (there is none), does not call the
 * workspace's lead webhook, and does not start follow-up automations. The only
 * message sent is the owner's normal new-lead alert, to the notification inbox
 * they already set up, and it says plainly that it is a test.
 */
export const sendTestLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const run = await runTestLead(context.supabase as unknown as SupabaseClient, data.organizationId);
    return { ok: true as const, leadId: run.leadId, alertedTo: run.alertedTo };
  });
