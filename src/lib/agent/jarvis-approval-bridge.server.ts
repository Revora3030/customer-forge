/**
 * Jarvis writes through the shared approvals consume step (PAI-4, admin scope).
 *
 * Jarvis already keeps its own single-use claim (jarvis_approvals). This adds
 * the shared step the plan asks for: when a super admin approves a Jarvis
 * proposal, an admin-scope agent approval for that exact proposal is requested,
 * decided by that admin (the database checks the super_admin role again) and
 * consumed once. A proposal that changed, or an approval that was already
 * used, is refused here as well.
 *
 * The approval binds to a small record (the approval key, the action id and a
 * SHA-256 of the whole proposal), so a large proposal never hits the size cap
 * and nothing in the proposal is copied into a second table.
 *
 * If the shared approvals store itself can't be reached (an error, not a
 * refusal) this returns `unavailable` and the caller keeps relying on the
 * Jarvis claim, which has already passed. It never turns an outage into a yes
 * that the Jarvis claim did not give.
 */
import {
  consumeApproval,
  decideApproval,
  hashApprovalArgs,
  requestApproval,
  type ApprovalDeps,
} from "./approvals.server";

export type JarvisBridgeResult =
  | { ok: true; recorded: true; approvalId: string }
  | { ok: true; recorded: false; reason: "unavailable" }
  | { ok: false; reason: string; message: string };

export const JARVIS_TOOL_PREFIX = "jarvis.";

export function jarvisApprovalArgs(key: string, proposal: { id: string }) {
  return { approvalKey: key, action: proposal.id, proposalHash: hashApprovalArgs(proposal) };
}

export async function consumeJarvisWriteApproval(
  deps: ApprovalDeps,
  input: { userId: string; key: string; proposal: { id: string }; summary: string },
): Promise<JarvisBridgeResult> {
  const tool = `${JARVIS_TOOL_PREFIX}${input.proposal.id}`.slice(0, 80);
  const args = jarvisApprovalArgs(input.key, input.proposal);
  try {
    const asked = await requestApproval(deps, {
      organizationId: null,
      scope: "admin",
      tool,
      args,
      summary: input.summary || tool,
      requestedBy: input.userId,
    });
    if (!asked.ok) return { ok: false, reason: asked.reason, message: asked.message };
    const decided = await decideApproval(deps, {
      approvalId: asked.approval.id,
      deciderId: input.userId,
      decision: "approve",
    });
    if (!decided.ok) return { ok: false, reason: decided.reason, message: decided.message };
    const used = await consumeApproval(deps, {
      organizationId: null,
      scope: "admin",
      tool,
      args,
      approvalId: asked.approval.id,
    });
    if (!used.ok) return { ok: false, reason: used.reason, message: used.message };
    return { ok: true, recorded: true, approvalId: used.approval.id };
  } catch {
    return { ok: true, recorded: false, reason: "unavailable" };
  }
}
