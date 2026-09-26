import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processDueRuns } from "@/lib/automation-engine";

/**
 * Delivers every automation step that has come due for the caller's workspace.
 * Runs as the signed-in user, so RLS keeps it scoped to workspaces they belong
 * to. Email goes out through Lovable's managed sending; SMS reports honestly
 * until a provider is connected.
 */
export const runDueAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS: a caller outside this workspace sees no rows at all.
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (!org?.id) throw new Error("Workspace not found");

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("email, owner_email")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const { deliverRun } = await import("@/lib/messaging.server");
    return processDueRuns(supabase, data.organizationId, {
      businessName: org.name,
      deliver: (run) =>
        deliverRun(run, {
          businessName: org.name,
          replyTo: profile?.email ?? profile?.owner_email ?? null,
        }),
    });
  });
