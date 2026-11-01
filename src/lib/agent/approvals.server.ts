/**
 * Server-side approvals for the AI agent (PAI-4).
 *
 * Anything an agent run wants to send outside the business waits here for the
 * workspace owner. The rules, in order:
 *
 *  - The workspace comes from the session (`organizationId` is a parameter the
 *    server fills in), never from anything the model wrote.
 *  - An approval is bound to the SHA-256 of the exact arguments. Change one
 *    character after the owner tapped Approve and `consume` finds nothing.
 *  - Only the workspace owner can approve or reject (admin-scope approvals:
 *    only a super admin). The check is enforced in the SQL function too.
 *  - An approval is used once. A replay, an expired or a rejected approval is
 *    refused. Approvals expire 24 hours after they were asked for.
 *
 * `ApprovalRepo` is the storage seam: `supabaseApprovalRepo` calls the SQL
 * functions in 20261101040000_agent_approvals.sql; tests use an in-memory copy
 * of the same rules. `createApprovalsConsumer` plugs straight into the tool
 * registry's `approvals` dependency (PAI-1), and a run that is waiting on an
 * approval is resumed through the optional `resumeRun` dependency (PAI-2).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const APPROVAL_TTL_SECONDS = 24 * 60 * 60;
export const MAX_APPROVAL_ARGS_BYTES = 16_384;

export type ApprovalScope = "owner" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed" | "cancelled";

export type ApprovalRow = {
  id: string;
  organization_id: string | null;
  scope: ApprovalScope;
  run_id: string | null;
  step_id: string | null;
  requested_by: string | null;
  tool: string;
  args: Record<string, unknown>;
  args_hash: string;
  summary: string;
  status: ApprovalStatus;
  created_at: string;
  expires_at: string;
  decided_by: string | null;
  decided_at: string | null;
  consumed_at: string | null;
};

export type DecideOutcome = "approved" | "rejected" | "forbidden" | "expired" | "already_decided" | "not_found";
export type ConsumeOutcome = "consumed" | "not_found" | "not_approved" | "rejected" | "expired" | "used" | "changed";

export type NewApproval = {
  organizationId: string | null;
  scope: ApprovalScope;
  runId: string | null;
  stepId: string | null;
  requestedBy: string | null;
  tool: string;
  args: Record<string, unknown>;
  argsHash: string;
  summary: string;
  ttlSeconds: number;
};

export interface ApprovalRepo {
  /** `created` is false when a live approval for the same action already existed. */
  request(input: NewApproval): Promise<{ approval: ApprovalRow; created: boolean }>;
  decide(id: string, deciderId: string, approve: boolean): Promise<{ outcome: DecideOutcome; approval: ApprovalRow | null }>;
  consume(input: {
    organizationId: string | null;
    scope: ApprovalScope;
    tool: string;
    argsHash: string;
    id?: string | null;
  }): Promise<{ outcome: ConsumeOutcome; approval: ApprovalRow | null }>;
  cancelForRun(runId: string): Promise<number>;
  sweep(): Promise<number>;
}

export type ApprovalDeps = {
  repo: ApprovalRepo;
  /** An honest line for the run's event feed. Must not throw; failures are swallowed. */
  emit?: (runId: string, kind: string, message: string, data?: Record<string, unknown>) => Promise<void> | void;
  /** Called when a decision should wake the waiting run (e.g. `RunRepo.resume`). */
  resumeRun?: (runId: string) => Promise<unknown> | unknown;
};

/* --------------------------------- hashing -------------------------------- */

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * SHA-256 of the arguments with keys sorted, so key order never matters. This
 * is the same function as `hashToolArguments` in the tool registry (PAI-1), so
 * the registry's `argsHash` and the stored `args_hash` always agree.
 */
export function hashApprovalArgs(args: unknown): string {
  return createHash("sha256").update(stableStringify(args)).digest("hex");
}

/* ------------------------------- the service ------------------------------ */

export type ApprovalRefusal = { ok: false; reason: string; message: string };
export type ApprovalRequestResult = { ok: true; approval: ApprovalRow; reused: boolean } | ApprovalRefusal;

const DECIDE_MESSAGES: Record<Exclude<DecideOutcome, "approved" | "rejected">, string> = {
  forbidden: "Only the workspace owner can approve or reject this.",
  expired: "This approval ran out of time (they last 24 hours). Ask again to get a fresh one.",
  already_decided: "This was already decided.",
  not_found: "That approval doesn't exist.",
};

const CONSUME_MESSAGES: Record<Exclude<ConsumeOutcome, "consumed">, string> = {
  not_found: "No approval for this exact action.",
  not_approved: "Still waiting for the owner to approve this.",
  rejected: "The owner said no to this.",
  expired: "The approval for this ran out of time.",
  used: "This approval was already used once.",
  changed: "The action changed after it was approved, so it needs a new approval.",
};

async function note(deps: ApprovalDeps, runId: string | null, kind: string, message: string, data?: Record<string, unknown>) {
  if (!runId || !deps.emit) return;
  try {
    await deps.emit(runId, kind, message, data);
  } catch {
    // The feed is a courtesy; it never blocks an approval.
  }
}

/**
 * Ask the owner. Asking again for the same workspace, tool and arguments while
 * one is live returns that same approval (no duplicate prompts).
 */
export async function requestApproval(
  deps: ApprovalDeps,
  input: {
    /** From the session. `null` only for admin-scope approvals. */
    organizationId: string | null;
    scope?: ApprovalScope;
    tool: string;
    args: Record<string, unknown>;
    /** One plain sentence the owner reads, e.g. "Text Dana Reyes: your quote is ready." */
    summary: string;
    runId?: string | null;
    stepId?: string | null;
    requestedBy?: string | null;
    ttlSeconds?: number;
  },
): Promise<ApprovalRequestResult> {
  const scope = input.scope ?? "owner";
  const refuse = (reason: string, message: string): ApprovalRefusal => ({ ok: false, reason, message });
  if (scope === "owner" && !input.organizationId) return refuse("no_workspace", "An approval needs a workspace.");
  if (scope === "admin" && input.organizationId) return refuse("scope", "Admin approvals aren't tied to one workspace.");
  const tool = input.tool.trim();
  if (!tool || tool.length > 80) return refuse("bad_tool", "That action name isn't valid.");
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!summary) return refuse("no_summary", "An approval needs a one-line summary for the owner.");
  if (!input.args || typeof input.args !== "object" || Array.isArray(input.args)) {
    return refuse("bad_args", "The action's details must be an object.");
  }
  if (Buffer.byteLength(JSON.stringify(input.args) ?? "", "utf8") > MAX_APPROVAL_ARGS_BYTES) {
    return refuse("args_too_large", "The action is too large to approve in one go.");
  }
  const ttl = Math.min(APPROVAL_TTL_SECONDS, Math.max(60, Math.floor(input.ttlSeconds ?? APPROVAL_TTL_SECONDS)));
  const { approval, created } = await deps.repo.request({
    organizationId: scope === "admin" ? null : input.organizationId,
    scope,
    runId: input.runId ?? null,
    stepId: input.stepId ?? null,
    requestedBy: input.requestedBy ?? null,
    tool,
    args: input.args,
    // Always computed here from the arguments; a caller can't pass a hash that doesn't match.
    argsHash: hashApprovalArgs(input.args),
    summary,
    ttlSeconds: ttl,
  });
  if (created) await note(deps, approval.run_id, "approval_requested", `Waiting for the owner to approve: ${summary}`, { approvalId: approval.id, tool });
  return { ok: true, approval, reused: !created };
}

export type ApprovalDecisionResult =
  | { ok: true; decision: "approved" | "rejected"; approval: ApprovalRow }
  | ApprovalRefusal;

/** The owner's tap. `deciderId` is the signed-in user from the session. */
export async function decideApproval(
  deps: ApprovalDeps,
  input: { approvalId: string; deciderId: string; decision: "approve" | "reject" },
): Promise<ApprovalDecisionResult> {
  if (!input.approvalId || !input.deciderId) return { ok: false, reason: "not_found", message: DECIDE_MESSAGES.not_found };
  const { outcome, approval } = await deps.repo.decide(input.approvalId, input.deciderId, input.decision === "approve");
  if (outcome !== "approved" && outcome !== "rejected") {
    return { ok: false, reason: outcome, message: DECIDE_MESSAGES[outcome] };
  }
  if (!approval) return { ok: false, reason: "not_found", message: DECIDE_MESSAGES.not_found };
  await note(
    deps,
    approval.run_id,
    outcome === "approved" ? "approval_approved" : "approval_rejected",
    outcome === "approved" ? `The owner approved: ${approval.summary}` : `The owner said no: ${approval.summary}`,
    { approvalId: approval.id, tool: approval.tool },
  );
  if (approval.run_id && deps.resumeRun) {
    try {
      await deps.resumeRun(approval.run_id);
    } catch {
      // The run is picked up by the sweeper if the wake-up fails.
    }
  }
  return { ok: true, decision: outcome, approval };
}

export type ApprovalConsumeResult = { ok: true; approval: ApprovalRow } | (ApprovalRefusal & { reason: ConsumeOutcome });

/**
 * Use an approval, once, for exactly these arguments. Pass either the
 * arguments themselves or the hash the tool registry already computed.
 */
export async function consumeApproval(
  deps: ApprovalDeps,
  input: {
    organizationId: string | null;
    scope?: ApprovalScope;
    tool: string;
    args?: unknown;
    argsHash?: string;
    approvalId?: string | null;
  },
): Promise<ApprovalConsumeResult> {
  const scope = input.scope ?? "owner";
  const argsHash = input.args !== undefined ? hashApprovalArgs(input.args) : (input.argsHash ?? "");
  if (!/^[0-9a-f]{64}$/.test(argsHash) || (scope === "owner" && !input.organizationId)) {
    return { ok: false, reason: "not_found", message: CONSUME_MESSAGES.not_found };
  }
  const { outcome, approval } = await deps.repo.consume({
    organizationId: scope === "admin" ? null : input.organizationId,
    scope,
    tool: input.tool,
    argsHash,
    id: input.approvalId ?? null,
  });
  if (outcome !== "consumed" || !approval) {
    const reason = outcome === "consumed" ? "not_found" : outcome;
    return { ok: false, reason, message: CONSUME_MESSAGES[reason] };
  }
  await note(deps, approval.run_id, "approval_used", `Sent with the owner's approval: ${approval.summary}`, {
    approvalId: approval.id,
    tool: approval.tool,
  });
  return { ok: true, approval };
}

/**
 * The `approvals` dependency of the tool registry (PAI-1): `send_external`
 * tools run only when this returns true, and it can return true once per
 * approval. The workspace comes from the registry's session context.
 */
export function createApprovalsConsumer(deps: ApprovalDeps, scope: ApprovalScope = "owner") {
  return {
    consume: async (call: { tool: string; argsHash: string; context: { organizationId: string } }): Promise<boolean> => {
      const result = await consumeApproval(deps, {
        organizationId: call.context.organizationId,
        scope,
        tool: call.tool,
        argsHash: call.argsHash,
      });
      return result.ok;
    },
  };
}

/** A cancelled or failed run must not leave live approvals behind. */
export const cancelApprovalsForRun = (deps: ApprovalDeps, runId: string) => deps.repo.cancelForRun(runId);
export const sweepExpiredApprovals = (deps: ApprovalDeps) => deps.repo.sweep();

/* --------------------------- Supabase implementation ----------------------- */

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type RpcClient = { rpc(fn: string, args?: Record<string, unknown>): RpcResult };

async function call(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

const asOutcome = (data: unknown): { outcome: string; created: boolean; approval: ApprovalRow | null } => {
  const value = (Array.isArray(data) ? data[0] : data) as { outcome?: string; created?: boolean; approval?: ApprovalRow } | null;
  return { outcome: value?.outcome ?? "not_found", created: value?.created === true, approval: value?.approval ?? null };
};

/** Pass the service-role client; a browser client can't execute these functions. */
export function supabaseApprovalRepo(admin: SupabaseClient | unknown): ApprovalRepo {
  const client = admin as RpcClient;
  return {
    async request(input) {
      const out = asOutcome(
        await call(client, "agent_approval_request", {
          _org: input.organizationId,
          _scope: input.scope,
          _run: input.runId,
          _step: input.stepId,
          _user: input.requestedBy,
          _tool: input.tool,
          _args: input.args,
          _hash: input.argsHash,
          _summary: input.summary,
          _ttl_seconds: input.ttlSeconds,
        }),
      );
      if (!out.approval) throw new Error("agent_approval_request returned no row");
      return { approval: out.approval, created: out.created };
    },
    async decide(id, deciderId, approve) {
      const { outcome, approval } = asOutcome(await call(client, "agent_approval_decide", { _id: id, _decider: deciderId, _approve: approve }));
      return { outcome: outcome as DecideOutcome, approval };
    },
    async consume(input) {
      const { outcome, approval } = asOutcome(
        await call(client, "agent_approval_consume", {
          _org: input.organizationId,
          _scope: input.scope,
          _tool: input.tool,
          _hash: input.argsHash,
          _id: input.id ?? null,
        }),
      );
      return { outcome: outcome as ConsumeOutcome, approval };
    },
    async cancelForRun(runId) {
      return Number(await call(client, "agent_approval_cancel_for_run", { _run: runId })) || 0;
    },
    async sweep() {
      return Number(await call(client, "agent_approval_sweep", {})) || 0;
    },
  };
}
