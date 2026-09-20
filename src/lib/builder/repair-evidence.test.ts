import { describe, expect, it } from "vitest";
import {
  decideRepair,
  describeRepairDecision,
  evidenceScore,
  summariseRepairDecisions,
  type RepairEvidence,
} from "./repair-evidence";

const measured = (errors: number, warnings: number): RepairEvidence => ({
  errors,
  warnings,
  rendered: true,
  widthsChecked: [320, 768, 1280],
});

describe("evidence-gated repair decisions", () => {
  it("weighs blocking problems above cosmetic ones", () => {
    expect(evidenceScore(measured(1, 0))).toBeLessThan(evidenceScore(measured(0, 5)));
  });

  it("keeps a repair that measurably reduces problems", () => {
    const decision = decideRepair(measured(2, 3), measured(0, 1));
    expect(decision.decision).toBe("keep");
    expect(decision.state).toBe("PASS");
    expect(decision.delta).toBeGreaterThan(0);
  });

  it("rolls back a repair that makes things worse", () => {
    const decision = decideRepair(measured(0, 1), measured(1, 1));
    expect(decision.decision).toBe("rollback");
    expect(decision.state).toBe("FAIL");
  });

  it("rolls back when nothing was actually rendered", () => {
    const decision = decideRepair(measured(2, 0), { errors: 0, warnings: 0, rendered: false });
    expect(decision.decision).toBe("rollback");
    expect(decision.state).toBe("NOT_VERIFIED");
  });

  it("rolls back when no widths were measured", () => {
    const decision = decideRepair(measured(2, 0), { errors: 0, warnings: 0, rendered: true, widthsChecked: [] });
    expect(decision.state).toBe("NOT_VERIFIED");
  });

  it("rolls back a no-change repair that still leaves blocking problems", () => {
    const decision = decideRepair(measured(1, 0), measured(1, 0));
    expect(decision.decision).toBe("rollback");
    expect(decision.state).toBe("FAIL");
  });

  it("keeps a harmless no-change repair on a clean page", () => {
    const decision = decideRepair(measured(0, 0), measured(0, 0));
    expect(decision.decision).toBe("keep");
    expect(decision.state).toBe("UNKNOWN");
  });

  it("reports blocked repairs with the exact reason", () => {
    const decision = decideRepair(null, null, { blocked: true, blockedReason: "no browser available" });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reason).toBe("no browser available");
    expect(describeRepairDecision("Mobile overflow", decision)).toContain("[BLOCKED]");
  });

  it("never reports a pass when nothing was attempted", () => {
    expect(summariseRepairDecisions([]).state).toBe("NOT_VERIFIED");
  });

  it("summarises kept and rolled-back repairs honestly", () => {
    const summary = summariseRepairDecisions([
      decideRepair(measured(2, 0), measured(0, 0)),
      decideRepair(measured(0, 1), measured(2, 1)),
    ]);
    expect(summary).toMatchObject({ kept: 1, rolledBack: 1, state: "PASS" });
    expect(summary.line).toContain("1 kept, 1 rolled back");
  });

  it("reports FAIL when every attempted repair was rolled back", () => {
    expect(summariseRepairDecisions([decideRepair(measured(0, 1), measured(3, 1))]).state).toBe("FAIL");
  });
});
