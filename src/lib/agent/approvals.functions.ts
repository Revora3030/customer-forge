import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { ApprovalRow } from "./approvals.server";

/** An approval row as it crosses the wire: arguments are plain JSON. */
export type WireApproval = Omit<ApprovalRow, "args"> & { args: Json };

const orgInput = z.object({ organizationId: z.string().uuid() });
const decideInput = z.object({
  organizationId: z.string().uuid(),
  approvalId: z.string().uuid(),
  approve: z.boolean(),
});

/** What is waiting for the workspace owner to approve. Any member can see it; only the owner can decide. */
export const listAgentApprovalsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => orgInput.parse(input))
  .handler(async ({ data, context }): Promise<{ approvals: WireApproval[] }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(
      context.supabase,
      data.organizationId,
      String(context.userId),
      "viewer",
    );
    const { listWaitingApprovals } = await import("./approvals-owner.server");
    return {
      approvals: (await listWaitingApprovals(context.supabase, orgId)) as unknown as WireApproval[],
    };
  });

/** One tap. Owner only (checked here and again inside the database function). */
export const decideAgentApprovalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decideInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; decision: "approved" | "rejected" } | { ok: false; message: string }
    > => {
      const { requireOrgRole } = await import("@/lib/org-authz.server");
      const orgId = await requireOrgRole(
        context.supabase,
        data.organizationId,
        String(context.userId),
        "owner",
      );
      const { decideForOrganization, supabaseApprovalRepo } =
        await import("./approvals-owner.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { supabaseRunRepo } = await import("./run-store.server");
      const runs = supabaseRunRepo(supabaseAdmin);
      const result = await decideForOrganization(
        context.supabase,
        { repo: supabaseApprovalRepo(supabaseAdmin), resumeRun: (runId) => runs.resume(runId) },
        {
          organizationId: orgId,
          approvalId: data.approvalId,
          deciderId: String(context.userId),
          approve: data.approve,
        },
      );
      return result.ok
        ? { ok: true, decision: result.decision }
        : { ok: false, message: result.message };
    },
  );
