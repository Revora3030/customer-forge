/**
 * Server-owned safety policy for Jarvis Autopilot.
 * Model output may propose a registered tool; only deterministic server policy authorizes it.
 */
export type JarvisRisk = "low" | "medium" | "high" | "critical";
export type JarvisAccess = "read" | "write";
export type JarvisConnectorState = "ready" | "needs_connection" | "not_implemented" | "degraded";
export type JarvisActionStatus = "proposed" | "awaiting_approval" | "running" | "succeeded" | "failed" | "blocked" | "verification_failed";
export type JarvisToolDefinition = {
  id: string; description: string; access: JarvisAccess; risk: JarvisRisk; connector: string;
  reversible: boolean; idempotent: boolean; maxRuntimeMs: number; maxOutputBytes: number; requiresApproval: boolean;
};
export type JarvisPolicyContext = {
  authenticated: boolean; superAdmin: boolean; autopilotEnabled: boolean; killSwitchEngaged: boolean;
  migrationVerified: boolean; preflightVerified: boolean; connectorState: JarvisConnectorState;
  actionCount: number; maxActionsPerRun: number; alreadyExecutedIdempotencyKey?: string | null;
};
export type JarvisPolicyDecision =
  | { allowed: true; mode: "autonomous" | "approval_required"; reason: string }
  | { allowed: false; mode: "blocked"; reason: string };
const deny = (reason: string): JarvisPolicyDecision => ({ allowed: false, mode: "blocked", reason });

/** Fail closed until auth, migration, preflight, connector and budget gates pass. */
export function authorizeJarvisAction(tool: JarvisToolDefinition, context: JarvisPolicyContext): JarvisPolicyDecision {
  if (!context.authenticated) return deny("authentication_required");
  if (!context.superAdmin) return deny("super_admin_required");
  if (context.killSwitchEngaged) return deny("autopilot_kill_switch_engaged");
  if (!context.migrationVerified) return deny("autopilot_migration_not_verified");
  if (!context.preflightVerified) return deny("autopilot_preflight_not_verified");
  if (context.connectorState !== "ready") return deny("connector_not_ready");
  if (!Number.isInteger(context.actionCount) || context.actionCount < 0) return deny("invalid_action_count");
  if (!Number.isInteger(context.maxActionsPerRun) || context.maxActionsPerRun < 1) return deny("invalid_run_budget");
  if (context.actionCount >= context.maxActionsPerRun) return deny("run_action_budget_exhausted");
  if (context.alreadyExecutedIdempotencyKey) return deny("idempotent_action_already_executed");
  if (tool.access === "read") return { allowed: true, mode: "autonomous", reason: "registered_read_tool" };
  if (!context.autopilotEnabled) return deny("autopilot_disabled");
  // Revora's owner policy requires an administrator's explicit approval for
  // EVERY mutating action, including low-risk, reversible, idempotent writes.
  // Autopilot may diagnose and prepare proposals, never silently commit writes.
  return {
    allowed: true,
    mode: "approval_required",
    reason: "all_write_actions_require_explicit_admin_approval",
  };
}
export function redactJarvisSummary(value: unknown, maxChars = 1200): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return (raw ?? "")
    .replace(/\b(?:sk|rk|pk|whsec|ghp|github_pat|xox[baprs])-[-_A-Za-z0-9]{8,}\b/gi, "[REDACTED_SECRET]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, Math.max(0, Math.min(maxChars, 4000)));
}
export function isTerminalJarvisStatus(status: JarvisActionStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "blocked" || status === "verification_failed";
}

export type JarvisApprovalProof = {
  approvalId: string;
  status: "pending" | "approved" | "rejected" | "expired";
  toolId: string;
  authenticated: boolean;
  superAdmin: boolean;
  approverId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  requestedInputHash: string | null;
  approvedInputHash: string | null;
};

export type JarvisApprovalDecision =
  | { allowed: true; reason: "valid_explicit_admin_approval" }
  | { allowed: false; reason: string };

/**
 * Bind approval to one tool and an exact SHA-256 digest of canonical validated
 * arguments. Call immediately before mutation and atomically consume the proof
 * in the persistence layer; this pure check is necessary, never sufficient,
 * for safe execution.
 */
export function validateJarvisWriteApproval(
  requestedToolId: string,
  inputHash: string,
  proof: JarvisApprovalProof,
  now = Date.now(),
): JarvisApprovalDecision {
  const denyApproval = (reason: string): JarvisApprovalDecision => ({ allowed: false, reason });
  if (!proof.authenticated) return denyApproval("approval_authentication_required");
  if (!proof.superAdmin) return denyApproval("approval_super_admin_required");
  if (!proof.approvalId.trim()) return denyApproval("approval_id_missing");
  if (proof.status !== "approved") return denyApproval("approval_not_approved");
  if (proof.toolId !== requestedToolId) return denyApproval("approval_tool_mismatch");
  if (!/^[a-f0-9]{64}$/i.test(inputHash)) return denyApproval("invalid_input_hash");
  if (!proof.requestedInputHash || !proof.approvedInputHash) return denyApproval("approval_input_hash_missing");
  if (!/^[a-f0-9]{64}$/i.test(proof.requestedInputHash) || !/^[a-f0-9]{64}$/i.test(proof.approvedInputHash))
    return denyApproval("invalid_approval_input_hash");
  if (proof.requestedInputHash.toLowerCase() !== inputHash.toLowerCase())
    return denyApproval("requested_input_hash_mismatch");
  if (proof.approvedInputHash.toLowerCase() !== inputHash.toLowerCase())
    return denyApproval("approved_input_hash_mismatch");
  if (!proof.approverId || !proof.approvedBy || proof.approverId !== proof.approvedBy)
    return denyApproval("approval_actor_mismatch");
  if (proof.consumedAt) return denyApproval("approval_already_consumed");
  if (!proof.approvedAt || !proof.expiresAt) return denyApproval("approval_timestamps_missing");
  const approvedAt = Date.parse(proof.approvedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt) || approvedAt > now)
    return denyApproval("invalid_approval_timestamps");
  if (expiresAt <= now || expiresAt <= approvedAt) return denyApproval("approval_expired");
  return { allowed: true, reason: "valid_explicit_admin_approval" };
}
