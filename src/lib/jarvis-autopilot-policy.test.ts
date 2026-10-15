import { describe, expect, it } from "vitest";
import {
  authorizeJarvisAction,
  isTerminalJarvisStatus,
  redactJarvisSummary,
  validateJarvisWriteApproval,
  type JarvisApprovalProof,
  type JarvisPolicyContext,
  type JarvisToolDefinition,
} from "./jarvis-autopilot-policy";

const context: JarvisPolicyContext = {
  authenticated: true,
  superAdmin: true,
  autopilotEnabled: true,
  killSwitchEngaged: false,
  migrationVerified: true,
  preflightVerified: true,
  connectorState: "ready",
  actionCount: 0,
  maxActionsPerRun: 4,
};
const safeWrite: JarvisToolDefinition = {
  id: "website.draft.update",
  description: "Update an explicitly approved draft",
  access: "write",
  risk: "low",
  connector: "website",
  reversible: true,
  idempotent: true,
  maxRuntimeMs: 5000,
  maxOutputBytes: 12000,
  requiresApproval: false,
};

describe("Jarvis Autopilot authorization policy", () => {
  it("allows registered read-only operations without enabling write autopilot", () => {
    expect(authorizeJarvisAction({ ...safeWrite, access: "read" }, { ...context, autopilotEnabled: false }))
      .toMatchObject({ allowed: true, mode: "autonomous", reason: "registered_read_tool" });
  });

  it("requires explicit approval for every write, even low-risk reversible idempotent writes", () => {
    expect(authorizeJarvisAction(safeWrite, context))
      .toMatchObject({ allowed: true, mode: "approval_required", reason: "all_write_actions_require_explicit_admin_approval" });
  });

  it.each([
    [{ authenticated: false }, "authentication_required"],
    [{ superAdmin: false }, "super_admin_required"],
    [{ killSwitchEngaged: true }, "autopilot_kill_switch_engaged"],
    [{ killSwitchEngaged: undefined }, "autopilot_kill_switch_engaged"],
    [{ migrationVerified: false }, "autopilot_migration_not_verified"],
    [{ preflightVerified: false }, "autopilot_preflight_not_verified"],
    [{ connectorState: "needs_connection" as const }, "connector_not_ready"],
    [{ actionCount: 4 }, "run_action_budget_exhausted"],
    [{ maxActionsPerRun: 21 }, "invalid_run_budget"],
    [{ alreadyExecutedIdempotencyKey: "run/action/key" }, "idempotent_action_already_executed"],
  ])("fails closed for unsafe context", (override, reason) => {
    const decision = authorizeJarvisAction(safeWrite, { ...context, ...override } as JarvisPolicyContext);
    expect(decision).toMatchObject({ allowed: false, reason });
  });

  it("rejects truthy strings and malformed tool metadata", () => {
    expect(authorizeJarvisAction(safeWrite, { ...context, authenticated: "false" } as never).allowed).toBe(false);
    expect(authorizeJarvisAction({ ...safeWrite, id: "../shell" }, context).allowed).toBe(false);
    expect(authorizeJarvisAction({ ...safeWrite, maxRuntimeMs: Number.NaN }, context).allowed).toBe(false);
    expect(authorizeJarvisAction({ ...safeWrite, maxOutputBytes: 1048577 }, context).allowed).toBe(false);
  });

  it("blocks writes when autopilot itself is disabled", () => {
    expect(authorizeJarvisAction(safeWrite, { ...context, autopilotEnabled: false }))
      .toMatchObject({ allowed: false, reason: "autopilot_disabled" });
  });

  it("cannot downgrade high-risk or explicitly gated tool definitions", () => {
    expect(authorizeJarvisAction({ ...safeWrite, risk: "critical" }, context))
      .toMatchObject({ allowed: true, mode: "approval_required" });
    expect(authorizeJarvisAction({ ...safeWrite, requiresApproval: true }, context))
      .toMatchObject({ allowed: true, mode: "approval_required" });
  });

  it("redacts common secrets, bearer tokens, URL parameters, and emails", () => {
    const result = redactJarvisSummary("owner@example.com api_key=abc123456789 Authorization: Bearer supersecretvalue sk-live-abcdefgh1234 https://user:password@example.test/path?token=private#fragment");
    for (const value of ["owner@example.com", "abc123456789", "supersecretvalue", "sk-live-abcdefgh1234", "user:password", "token=private"])
      expect(result).not.toContain(value);
    expect(result).toContain("[REDACTED");
  });

  it("handles circular values and clamps output limits", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(redactJarvisSummary(circular)).toBe("[UNSERIALIZABLE]");
    expect(redactJarvisSummary("x".repeat(5000), Number.NaN)).toHaveLength(1200);
    expect(redactJarvisSummary("x".repeat(5000), 99999)).toHaveLength(4000);
  });

  it("identifies terminal action states", () => {
    expect(isTerminalJarvisStatus("succeeded")).toBe(true);
    expect(isTerminalJarvisStatus("verification_failed")).toBe(true);
    expect(isTerminalJarvisStatus("running")).toBe(false);
  });
});

describe("Jarvis hash-bound single-use approval", () => {
  const now = Date.parse("2026-10-15T12:00:00.000Z");
  const valid: JarvisApprovalProof = {
    approvalId: "approval-123",
    status: "approved",
    toolId: "website.draft.update",
    authenticated: true,
    superAdmin: true,
    approverId: "admin-user",
    approvedBy: "admin-user",
    approvedAt: "2026-10-15T11:59:00.000Z",
    expiresAt: "2026-10-15T12:05:00.000Z",
    consumedAt: null,
    requestedInputHash: "a".repeat(64),
    approvedInputHash: "a".repeat(64),
  };

  it("accepts an unexpired admin approval bound to this tool and exact payload hash", () => {
    expect(validateJarvisWriteApproval("website.draft.update", "a".repeat(64), valid, now))
      .toEqual({ allowed: true, reason: "valid_explicit_admin_approval" });
  });

  it.each([
    [{ authenticated: false }, "approval_authentication_required"],
    [{ superAdmin: false }, "approval_super_admin_required"],
    [{ status: "pending" as const }, "approval_not_approved"],
    [{ toolId: "website.publish" }, "approval_tool_mismatch"],
    [{ consumedAt: "2026-10-15T11:59:30.000Z" }, "approval_already_consumed"],
    [{ expiresAt: "2026-10-15T11:59:59.000Z" }, "approval_expired"],
    [{ approvedBy: "different-admin" }, "approval_actor_mismatch"],
  ])("denies invalid, expired, replayed, or mismatched approval", (override, reason) => {
    expect(validateJarvisWriteApproval(
      "website.draft.update",
      "a".repeat(64),
      { ...valid, ...override },
      now,
    )).toEqual({ allowed: false, reason });
  });

  it("rejects changed or malformed arguments after approval", () => {
    expect(validateJarvisWriteApproval("website.draft.update", "b".repeat(64), valid, now))
      .toEqual({ allowed: false, reason: "requested_input_hash_mismatch" });
    expect(validateJarvisWriteApproval("website.draft.update", "not-a-hash", valid, now))
      .toEqual({ allowed: false, reason: "invalid_input_hash" });
  });
});
