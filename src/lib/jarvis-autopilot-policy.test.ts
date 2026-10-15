import { describe, expect, it } from "vitest";
import {
  authorizeJarvisAction, isTerminalJarvisStatus, redactJarvisSummary,
  type JarvisPolicyContext, type JarvisToolDefinition,
} from "./jarvis-autopilot-policy";

const context: JarvisPolicyContext = {
  authenticated: true, superAdmin: true, autopilotEnabled: true, killSwitchEngaged: false,
  migrationVerified: true, preflightVerified: true, connectorState: "ready",
  actionCount: 0, maxActionsPerRun: 4,
};
const safeWrite: JarvisToolDefinition = {
  id: "diagnostics.refresh", description: "Refresh bounded diagnostics", access: "write",
  risk: "low", connector: "supabase", reversible: true, idempotent: true,
  maxRuntimeMs: 5000, maxOutputBytes: 12000, requiresApproval: false,
};
const denials: [Partial<JarvisPolicyContext>, string][] = [
  [{ authenticated: false }, "authentication_required"],
  [{ superAdmin: false }, "super_admin_required"],
  [{ killSwitchEngaged: true }, "autopilot_kill_switch_engaged"],
  [{ migrationVerified: false }, "autopilot_migration_not_verified"],
  [{ preflightVerified: false }, "autopilot_preflight_not_verified"],
  [{ connectorState: "needs_connection" }, "connector_not_ready"],
  [{ actionCount: 4 }, "run_action_budget_exhausted"],
  [{ alreadyExecutedIdempotencyKey: "run/action/key" }, "idempotent_action_already_executed"],
  [{ maxActionsPerRun: 21 }, "invalid_run_budget"],
];

describe("Jarvis Autopilot policy", () => {
  it("allows low-risk reversible idempotent writes", () => {
    expect(authorizeJarvisAction(safeWrite, context)).toMatchObject({ allowed: true, mode: "autonomous" });
  });
  it.each(denials)("fails closed for unsafe context", (override, reason) => {
    expect(authorizeJarvisAction(safeWrite, { ...context, ...override }))
      .toMatchObject({ allowed: false, reason });
  });
  it("rejects truthy strings used as authorization booleans", () => {
    expect(authorizeJarvisAction(safeWrite, { ...context, authenticated: "false" } as never).allowed).toBe(false);
    expect(authorizeJarvisAction(safeWrite, { ...context, migrationVerified: "true" } as never).allowed).toBe(false);
    expect(authorizeJarvisAction(safeWrite, { ...context, killSwitchEngaged: undefined } as never).allowed).toBe(false);
  });
  it("rejects malformed tool definitions", () => {
    expect(authorizeJarvisAction({ ...safeWrite, access: "execute" } as never, context).allowed).toBe(false);
    expect(authorizeJarvisAction({ ...safeWrite, maxRuntimeMs: Number.NaN }, context).allowed).toBe(false);
    expect(authorizeJarvisAction({ ...safeWrite, maxOutputBytes: 0 }, context).allowed).toBe(false);
    expect(authorizeJarvisAction({ ...safeWrite, id: "../shell" }, context).allowed).toBe(false);
  });
  it("requires approval for critical writes and non-idempotent writes", () => {
    expect(authorizeJarvisAction({ ...safeWrite, id: "billing.refund", risk: "critical", reversible: false }, context))
      .toMatchObject({ allowed: true, mode: "approval_required" });
    expect(authorizeJarvisAction({ ...safeWrite, idempotent: false }, context))
      .toMatchObject({ allowed: true, mode: "approval_required" });
  });
  it("does not bypass approval for a read tool", () => {
    expect(authorizeJarvisAction({ ...safeWrite, access: "read", requiresApproval: true }, context))
      .toMatchObject({ allowed: true, mode: "approval_required" });
    expect(authorizeJarvisAction({ ...safeWrite, access: "read", risk: "critical" }, context))
      .toMatchObject({ allowed: true, mode: "approval_required" });
  });
  it("blocks writes when autopilot is disabled", () => {
    expect(authorizeJarvisAction(safeWrite, { ...context, autopilotEnabled: false }))
      .toMatchObject({ allowed: false, reason: "autopilot_disabled" });
  });
  it("preserves ordinary reads when autopilot writes are disabled", () => {
    expect(authorizeJarvisAction({ ...safeWrite, access: "read" }, { ...context, autopilotEnabled: false }))
      .toMatchObject({ allowed: true, mode: "autonomous" });
  });
  it("redacts secrets and emails", () => {
    const result = redactJarvisSummary("owner@example.com api_key=abc123456789 Authorization: Bearer supersecretvalue sk-live-abcdefgh1234");
    for (const value of ["owner@example.com", "abc123456789", "supersecretvalue", "sk-live-abcdefgh1234"])
      expect(result).not.toContain(value);
    expect(result).toContain("[REDACTED");
  });
  it.each(["sb_secret_", "sk_live_", "sk_test_", "whsec_", "ghp_", "github_pat_", "lov_"])(
    "redacts unlabelled underscore credential prefix %s", (prefix) => {
      const value = prefix + "a".repeat(24);
      expect(redactJarvisSummary(value)).not.toContain(value);
    },
  );
  it("strips URL credentials, query values and JSON secret values", () => {
    expect(redactJarvisSummary("https://user:password@example.test/path?token=private#fragment"))
      .toBe("https://example.test/path");
    expect(redactJarvisSummary({ api_key: "privatevalue" })).not.toContain("privatevalue");
  });
  it("handles circular data and bounds invalid limits", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(redactJarvisSummary(circular)).toBe("[UNSERIALIZABLE]");
    expect(redactJarvisSummary("a".repeat(5000), Number.NaN)).toHaveLength(1200);
    expect(redactJarvisSummary("a".repeat(5000), 99999)).toHaveLength(4000);
    expect(redactJarvisSummary("example", -1)).toBe("");
  });
  it("identifies terminal action states", () => {
    expect(isTerminalJarvisStatus("succeeded")).toBe(true);
    expect(isTerminalJarvisStatus("verification_failed")).toBe(true);
    expect(isTerminalJarvisStatus("running")).toBe(false);
  });
});
