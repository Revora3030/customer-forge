import { describe, expect, it } from "vitest";
import { authorizeJarvisAction, isTerminalJarvisStatus, redactJarvisSummary, type JarvisPolicyContext, type JarvisToolDefinition } from "./jarvis-autopilot-policy";
const context: JarvisPolicyContext = { authenticated:true, superAdmin:true, autopilotEnabled:true, killSwitchEngaged:false, migrationVerified:true, preflightVerified:true, connectorState:"ready", actionCount:0, maxActionsPerRun:4 };
const safeWrite: JarvisToolDefinition = { id:"diagnostics.refresh", description:"Refresh bounded diagnostics", access:"write", risk:"low", connector:"supabase", reversible:true, idempotent:true, maxRuntimeMs:5000, maxOutputBytes:12000, requiresApproval:false };
describe("Jarvis Autopilot policy", () => {
  it("requires explicit admin approval for every write, even low-risk reversible idempotent ones", () => expect(authorizeJarvisAction(safeWrite,context)).toMatchObject({allowed:true,mode:"approval_required",reason:"all_write_actions_require_explicit_admin_approval"}));
  it.each([
    [{authenticated:false},"authentication_required"], [{superAdmin:false},"super_admin_required"], [{killSwitchEngaged:true},"autopilot_kill_switch_engaged"],
    [{migrationVerified:false},"autopilot_migration_not_verified"], [{preflightVerified:false},"autopilot_preflight_not_verified"],
    [{connectorState:"needs_connection" as const},"connector_not_ready"], [{actionCount:4},"run_action_budget_exhausted"],
    [{alreadyExecutedIdempotencyKey:"run/action/key"},"idempotent_action_already_executed"],
  ])("fails closed for unsafe context", (override,reason) => {
    const result=authorizeJarvisAction(safeWrite,{...context,...override});
    expect(result.allowed).toBe(false); if(!result.allowed) expect(result.reason).toBe(reason);
  });
  it("requires approval for critical writes", () => expect(authorizeJarvisAction({...safeWrite,id:"billing.refund",risk:"critical",reversible:false},context)).toMatchObject({allowed:true,mode:"approval_required"}));
  it("never returns autonomous mode for any write risk level", () => {
    for (const risk of ["low","medium","high","critical"] as const) {
      const decision=authorizeJarvisAction({...safeWrite,risk},context);
      expect(decision.allowed).toBe(true);
      if(decision.allowed) expect(decision.mode).toBe("approval_required");
    }
  });
  it("requires approval for non-idempotent writes", () => expect(authorizeJarvisAction({...safeWrite,idempotent:false},context)).toMatchObject({allowed:true,mode:"approval_required"}));
  it("blocks writes when autopilot is disabled", () => expect(authorizeJarvisAction(safeWrite,{...context,autopilotEnabled:false})).toMatchObject({allowed:false,reason:"autopilot_disabled"}));
  it("redacts secrets and emails", () => {
    const result=redactJarvisSummary("owner@example.com api_key=abc123456789 Authorization: Bearer supersecretvalue sk-live-abcdefgh1234");
    expect(result).not.toContain("owner@example.com"); expect(result).not.toContain("abc123456789");
    expect(result).not.toContain("supersecretvalue"); expect(result).not.toContain("sk-live-abcdefgh1234"); expect(result).toContain("[REDACTED");
  });
  it("identifies terminal action states", () => { expect(isTerminalJarvisStatus("succeeded")).toBe(true); expect(isTerminalJarvisStatus("verification_failed")).toBe(true); expect(isTerminalJarvisStatus("running")).toBe(false); });
});
