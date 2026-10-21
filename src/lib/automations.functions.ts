import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { processDueRuns } from "@/lib/automation-engine";

/**
 * Delivers every automation step that has come due for the caller's workspace.
 * Membership is checked as the signed-in user (RLS on organizations); the
 * delivery pass itself is org-filtered and uses the service role. Email goes out through Lovable's managed sending; SMS reports honestly
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
      .select("email, owner_email, state")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // Browsers can no longer write automation_runs (migration 20261021120000),
    // so the due runs of this verified workspace are claimed with the service
    // role. Every query in processDueRuns is filtered by this organization id,
    // and only runs the server itself queued exist to be delivered.
    const [{ deliverRun }, { supabaseAdmin }] = await Promise.all([
      import("@/lib/messaging.server"),
      import("@/integrations/supabase/client.server"),
    ]);
    return processDueRuns(supabaseAdmin, org.id, {
      businessName: org.name,
      deliver: (run) =>
        deliverRun(run, {
          businessName: org.name,
          replyTo: profile?.email ?? profile?.owner_email ?? null,
          businessState: profile?.state ?? null,
        }),
    });
  });
