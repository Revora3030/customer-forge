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
  if (tool.risk === "critical" || tool.risk === "high" || tool.requiresApproval)
    return { allowed: true, mode: "approval_required", reason: "risk_requires_human_approval" };
  if (tool.risk !== "low" || !tool.reversible || !tool.idempotent)
    return { allowed: true, mode: "approval_required", reason: "write_not_safe_for_autonomous_execution" };
  return { allowed: true, mode: "autonomous", reason: "low_risk_reversible_idempotent_write" };
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
