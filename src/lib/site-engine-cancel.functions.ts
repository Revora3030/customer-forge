import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cancels the workspace's running or queued build (spec C).
 *
 * Only a manager or above may cancel (checked here and by the
 * generation_jobs_update RLS policy). A queued job never starts. A processing
 * job is fenced: the worker's next stage write matches no row (it requires
 * status = processing), so it stops at the next stage boundary and its
 * cleanup runs (AI pictures removed; a fresh rebuild restores its backup).
 * `cancelled` is terminal and outside the one-active-build index, so the
 * owner can press Build again immediately. Nothing is published.
 */
export const cancelSiteGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; jobId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const jobId = String(input?.jobId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid build");
    return { organizationId, jobId };
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "manager");
    const now = new Date().toISOString();
    const { data: rows, error } = await context.supabase
      .from("generation_jobs")
      .update({
        status: "cancelled",
        failure_kind: "cancelled",
        error_message: "[cancelled] Build cancelled by the owner. Nothing was published.",
        cancel_requested_at: now,
        cancelled_by: context.userId,
        completed_at: now,
        lease_expires_at: null,
      } as never)
      .eq("id", data.jobId)
      .eq("organization_id", data.organizationId)
      .in("status", ["queued", "processing"])
      .select("id");
    if (error) throw new Error("Couldn't cancel the build right now. Try again in a moment.");
    if (!rows || rows.length === 0) return { cancelled: false, reason: "That build has already finished." };
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("audit_logs").insert({
        organization_id: data.organizationId,
        actor_id: context.userId,
        action: "BUILD_CANCELLED",
        entity: "generation_job",
        entity_id: data.jobId,
        metadata: { job_id: data.jobId },
      } as never);
    }
    return { cancelled: true, reason: null };
  });
