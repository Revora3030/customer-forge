/**
 * PAI-4 wiring for the agent loop (PAI-3).
 *
 * One call builds both halves from the same approvals service, so they can
 * never disagree:
 *  - `registry`: the tool registry's `approvals` dependency. `send_external`
 *    tools run only when it finds an approved, unused approval for the exact
 *    arguments, and it uses that approval once.
 *  - `loop`: what the loop calls when the registry refused with `needs_approval`.
 *    It files the owner's approval request (workspace and run come from the
 *    run, never from the model) so the Approve card appears.
 *
 * Neither half touches the PAI-5 limits. Tool calls are counted once, by the
 * agent tool groups wrapper; a refused (unapproved) call never reaches that
 * wrapper, and the approved retry reaches it once.
 */
import {
  createApprovalsConsumer,
  requestApproval,
  type ApprovalDeps,
} from "@/lib/agent/approvals.server";
import type { LoopApprovals } from "@/lib/agent/loop.server";

/** One plain sentence for the owner's Approve card. */
export function describeApproval(tool: string, why?: string): string {
  const reason = why?.replace(/\s+/g, " ").trim();
  return reason ? `${reason.slice(0, 220)} (${tool})` : `Run ${tool}.`;
}

export function createLoopApprovals(deps: ApprovalDeps): LoopApprovals {
  return {
    request: async ({ run, tool, args, why, stepId }) => {
      const summary = describeApproval(tool, why);
      const result = await requestApproval(deps, {
        organizationId: run.organization_id,
        scope: "owner",
        tool,
        args,
        summary,
        runId: run.id,
        stepId,
        requestedBy: run.user_id,
      });
      if (!result.ok) return { ok: false, message: result.message };
      return { ok: true, approvalId: result.approval.id, summary: result.approval.summary };
    },
  };
}

export function createAgentApprovalWiring(deps: ApprovalDeps) {
  return { registry: createApprovalsConsumer(deps), loop: createLoopApprovals(deps) };
}
