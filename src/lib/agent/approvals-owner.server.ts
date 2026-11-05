/**
 * The owner's side of agent approvals (PAI-4 approve UI): list what is waiting in
 * their workspace, and decide one. The workspace comes from the session check done
 * by the caller; a row from another workspace is never decided or returned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideApproval,
  supabaseApprovalRepo,
  type ApprovalDecisionResult,
  type ApprovalDeps,
  type ApprovalRow,
} from "./approvals.server";

const COLUMNS =
  "id, organization_id, scope, run_id, step_id, requested_by, tool, args, args_hash, summary, status, created_at, expires_at, decided_by, decided_at, consumed_at";

/** Waiting approvals for one workspace, read with the caller's own client so RLS applies too. */
export async function listWaitingApprovals(
  client: SupabaseClient | unknown,
  organizationId: string,
  now = new Date(),
): Promise<ApprovalRow[]> {
  const { data, error } = await (client as SupabaseClient)
    .from("agent_approvals")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("scope", "owner")
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Couldn't load approvals.");
  return (data ?? []) as unknown as ApprovalRow[];
}

/**
 * Approve or reject one approval that belongs to `organizationId`. The SQL function
 * also checks that the decider is the workspace owner; this check makes a foreign
 * id read as "doesn't exist" instead of "forbidden".
 */
export async function decideForOrganization(
  userClient: SupabaseClient | unknown,
  deps: ApprovalDeps,
  input: { organizationId: string; approvalId: string; deciderId: string; approve: boolean },
): Promise<ApprovalDecisionResult> {
  const { data } = await (userClient as SupabaseClient)
    .from("agent_approvals")
    .select("id")
    .eq("id", input.approvalId)
    .eq("organization_id", input.organizationId)
    .eq("scope", "owner")
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found", message: "That approval doesn't exist." };
  return decideApproval(deps, {
    approvalId: input.approvalId,
    deciderId: input.deciderId,
    decision: input.approve ? "approve" : "reject",
  });
}

export { supabaseApprovalRepo };
