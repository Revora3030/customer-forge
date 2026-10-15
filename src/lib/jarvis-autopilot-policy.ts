/** Server-owned Jarvis policy. Model output cannot grant permission. */
export type JarvisRisk = "low" | "medium" | "high" | "critical";
export type JarvisAccess = "read" | "write";
export type JarvisConnectorState = "ready" | "needs_connection" | "not_implemented" | "degraded";
export type JarvisActionStatus = "proposed" | "awaiting_approval" | "running" | "succeeded" | "failed" | "blocked" | "verification_failed";

export type JarvisToolDefinition = {
  id: string;
  description: string;
  access: JarvisAccess;
  risk: JarvisRisk;
  connector: string;
  reversible: boolean;
  idempotent: boolean;
  maxRuntimeMs: number;
  maxOutputBytes: number;
  requiresApproval: boolean;
};

export type JarvisPolicyContext = {
  authenticated: boolean;
  superAdmin: boolean;
  autopilotEnabled: boolean;
  killSwitchEngaged: boolean;
  migrationVerified: boolean;
  preflightVerified: boolean;
  connectorState: JarvisConnectorState;
  actionCount: number;
  maxActionsPerRun: number;
  alreadyExecutedIdempotencyKey?: string | null;
};

export type JarvisPolicyDecision =
  | { allowed: true; mode: "autonomous" | "approval_required"; reason: string }
  | { allowed: false; mode: "blocked"; reason: string };

const deny = (reason: string): JarvisPolicyDecision => ({ allowed: false, mode: "blocked", reason });

function validTool(tool: JarvisToolDefinition): boolean {
  return !!tool && typeof tool === "object" &&
    typeof tool.id === "string" && /^[a-z][a-z0-9_.-]{2,100}$/.test(tool.id) &&
    typeof tool.description === "string" && tool.description.trim().length > 0 && tool.description.length <= 4000 &&
    typeof tool.connector === "string" && /^[a-z][a-z0-9_.-]{1,100}$/.test(tool.connector) &&
    (tool.access === "read" || tool.access === "write") &&
    ["low", "medium", "high", "critical"].includes(tool.risk) &&
    typeof tool.reversible === "boolean" && typeof tool.idempotent === "boolean" &&
    typeof tool.requiresApproval === "boolean" &&
    Number.isInteger(tool.maxRuntimeMs) && tool.maxRuntimeMs > 0 && tool.maxRuntimeMs <= 300000 &&
    Number.isInteger(tool.maxOutputBytes) && tool.maxOutputBytes > 0 && tool.maxOutputBytes <= 1048576;
}

/**
 * Authorizes whether a registered tool can be prepared or executed.
 * This function never executes a tool. Every mutation is approval-gated.
 */
export function authorizeJarvisAction(tool: JarvisToolDefinition, context: JarvisPolicyContext): JarvisPolicyDecision {
  if (!context || typeof context !== "object") return deny("invalid_policy_context");
  if (context.authenticated !== true) return deny("authentication_required");
  if (context.superAdmin !== true) return deny("super_admin_required");
  if (context.killSwitchEngaged !== false) return deny("autopilot_kill_switch_engaged");
  if (context.migrationVerified !== true) return deny("autopilot_migration_not_verified");
  if (context.preflightVerified !== true) return deny("autopilot_preflight_not_verified");
  if (context.connectorState !== "ready") return deny("connector_not_ready");
  if (typeof context.autopilotEnabled !== "boolean") return deny("invalid_autopilot_setting");
  if (!Number.isInteger(context.actionCount) || context.actionCount < 0) return deny("invalid_action_count");
  if (!Number.isInteger(context.maxActionsPerRun) || context.maxActionsPerRun < 1 || context.maxActionsPerRun > 20)
    return deny("invalid_run_budget");
  if (context.actionCount >= context.maxActionsPerRun) return deny("run_action_budget_exhausted");
  if (context.alreadyExecutedIdempotencyKey != null && typeof context.alreadyExecutedIdempotencyKey !== "string")
    return deny("invalid_idempotency_context");
  if (context.alreadyExecutedIdempotencyKey) return deny("idempotent_action_already_executed");
  if (!validTool(tool)) return deny("invalid_tool_definition");

  if (tool.risk === "critical" || tool.risk === "high" || tool.requiresApproval)
    return { allowed: true, mode: "approval_required", reason: "tool_definition_requires_approval" };

  if (tool.access === "read")
    return { allowed: true, mode: "autonomous", reason: "registered_read_tool" };

  if (context.autopilotEnabled !== true) return deny("autopilot_disabled");

  // Revora owner policy: every data mutation and external side effect needs
  // explicit administrator approval, regardless of risk, reversibility or retry safety.
  return {
    allowed: true,
    mode: "approval_required",
    reason: "all_write_actions_require_explicit_admin_approval",
  };
}

export function redactJarvisSummary(value: unknown, maxChars = 1200): string {
  let raw: string;
  try {
    raw = typeof value === "string" ? value : (JSON.stringify(value ?? "") ?? "");
  } catch {
    raw = "[UNSERIALIZABLE]";
  }
  const limit = Number.isFinite(maxChars) ? Math.max(0, Math.min(Math.floor(maxChars), 4000)) : 1200;
  return raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[REDACTED_URL]";
      }
    })
    .replace(/\b(?:sb_secret_|sk_(?:live|test)_|rk_(?:live|test)_|whsec_|gh[pousr]_|github_pat_|xox[baprs]-|sk-|lov_)[A-Za-z0-9_-]{8,}\b/gi, "[REDACTED_SECRET]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/\bbearer\s+[^\s"',;]+/gi, "Bearer [REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .slice(0, limit);
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

/** Pure guard; the persistence layer must atomically consume the approval immediately before execution. */
export function validateJarvisWriteApproval(
  requestedToolId: string,
  inputHash: string,
  proof: JarvisApprovalProof,
  now = Date.now(),
): JarvisApprovalDecision {
  const denied = (reason: string): JarvisApprovalDecision => ({ allowed: false, reason });
  if (!proof || typeof proof !== "object") return denied("approval_proof_missing");
  if (proof.authenticated !== true) return denied("approval_authentication_required");
  if (proof.superAdmin !== true) return denied("approval_super_admin_required");
  if (typeof proof.approvalId !== "string" || !proof.approvalId.trim()) return denied("approval_id_missing");
  if (proof.status !== "approved") return denied("approval_not_approved");
  if (proof.toolId !== requestedToolId) return denied("approval_tool_mismatch");
  if (typeof requestedToolId !== "string" || !/^[a-z][a-z0-9_.-]{2,100}$/.test(requestedToolId))
    return denied("invalid_tool_id");
  if (typeof inputHash !== "string" || !/^[a-f0-9]{64}$/i.test(inputHash)) return denied("invalid_input_hash");
  if (!proof.requestedInputHash || !proof.approvedInputHash) return denied("approval_input_hash_missing");
  if (!/^[a-f0-9]{64}$/i.test(proof.requestedInputHash) || !/^[a-f0-9]{64}$/i.test(proof.approvedInputHash))
    return denied("invalid_approval_input_hash");
  if (proof.requestedInputHash.toLowerCase() !== inputHash.toLowerCase())
    return denied("requested_input_hash_mismatch");
  if (proof.approvedInputHash.toLowerCase() !== inputHash.toLowerCase())
    return denied("approved_input_hash_mismatch");
  if (typeof proof.approverId !== "string" || typeof proof.approvedBy !== "string" ||
      !proof.approverId || !proof.approvedBy || proof.approverId !== proof.approvedBy)
    return denied("approval_actor_mismatch");
  if (proof.consumedAt) return denied("approval_already_consumed");
  if (typeof proof.approvedAt !== "string" || typeof proof.expiresAt !== "string" ||
      !proof.approvedAt || !proof.expiresAt) return denied("approval_timestamps_missing");
  const approvedAt = Date.parse(proof.approvedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt) || approvedAt > now)
    return denied("invalid_approval_timestamps");
  if (expiresAt <= now || expiresAt <= approvedAt) return denied("approval_expired");
  return { allowed: true, reason: "valid_explicit_admin_approval" };
}
