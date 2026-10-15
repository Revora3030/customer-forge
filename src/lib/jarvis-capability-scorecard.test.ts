import { describe, expect, it } from "vitest";
import { scoreJarvisCapabilities, type JarvisCapabilityCheckId, type JarvisCapabilityEvidence } from "./jarvis-capability-scorecard";

const completeEvidence = (): Partial<Record<JarvisCapabilityCheckId, JarvisCapabilityEvidence>> => {
  const evidence: Partial<Record<JarvisCapabilityCheckId, JarvisCapabilityEvidence>> = {};
  const ids = [
    "diagnostics.errorSample", "diagnostics.builderHealth", "diagnostics.schemaProbe", "diagnostics.redaction",
    "engineering.typecheck", "engineering.lint", "engineering.tests", "engineering.security", "engineering.browser",
    "growth.funnelSignals", "growth.offerConsistency", "growth.attribution", "growth.experiments",
    "acquisition.scoring", "acquisition.consent", "acquisition.suppression", "acquisition.delivery", "acquisition.paidConversion",
    "autonomy.killSwitch", "autonomy.approvalConsumption", "autonomy.idempotency", "autonomy.postconditions", "autonomy.recovery",
    "safety.superAdminBoundary", "safety.tenantIsolation", "safety.redaction", "safety.audit", "safety.secretBoundary",
    "reliability.ciSameHead", "reliability.productionRevision", "reliability.syntheticHealth", "reliability.migrations", "reliability.rollback",
  ] as JarvisCapabilityCheckId[];
  for (const id of ids) {
    evidence[id] = { status: "verified", summary: "Independent evidence passed.", source: "test fixture", checkedAt: "2026-10-15T12:00:00.000Z" };
  }
  return evidence;
};

describe("Jarvis evidence-backed capability scorecard", () => {
  it("models all seven capability areas", () => {
    const result = scoreJarvisCapabilities({});
    expect(result.areas.map((area) => area.id)).toEqual([
      "diagnostics", "engineering", "growth", "acquisition", "autonomy", "safety", "reliability",
    ]);
    expect(result.areas).toHaveLength(7);
    expect(result.totalChecks).toBeGreaterThanOrEqual(30);
  });

  it("never counts omitted evidence as a pass", () => {
    const result = scoreJarvisCapabilities({});
    expect(result.overallScore).toBe(0);
    expect(result.verifiedChecks).toBe(0);
    expect(result.areas.every((area) => area.score === 0 && area.status === "evidence_incomplete")).toBe(true);
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it("reports 10/10 only when every required check is explicitly verified", () => {
    const result = scoreJarvisCapabilities(completeEvidence());
    expect(result.overallScore).toBe(10);
    expect(result.verified10Of10Areas).toBe(7);
    expect(result.areas.every((area) => area.score === 10 && area.status === "verified_10_of_10")).toBe(true);
  });

  it("does not treat configured code as verified production behavior", () => {
    const evidence = completeEvidence();
    evidence["autonomy.postconditions"] = { status: "configured", summary: "Code path exists, but production checks are missing." };
    const result = scoreJarvisCapabilities(evidence);
    const autonomy = result.areas.find((area) => area.id === "autonomy");
    expect(autonomy?.score).toBe(8);
    expect(autonomy?.status).toBe("evidence_incomplete");
    expect(result.verified10Of10Areas).toBe(6);
  });

  it("surfaces failed checks as gaps and identifies what is missing", () => {
    const evidence = completeEvidence();
    evidence["safety.tenantIsolation"] = { status: "failed", summary: "Cross-tenant negative test allowed a read." };
    const result = scoreJarvisCapabilities(evidence);
    const safety = result.areas.find((area) => area.id === "safety");
    expect(safety?.score).toBe(8);
    expect(safety?.status).toBe("gaps_found");
    expect(safety?.blockers.some((item) => item.includes("Cross-tenant negative test"))).toBe(true);
  });

  it("rejects malformed evidence rather than granting a green check", () => {
    const evidence = completeEvidence() as unknown as Record<string, unknown>;
    evidence["reliability.rollback"] = { status: "verified", summary: 123 };
    const result = scoreJarvisCapabilities(evidence as never);
    const reliability = result.areas.find((area) => area.id === "reliability");
    expect(reliability?.score).toBe(8);
    expect(reliability?.checks.find((check) => check.id === "reliability.rollback")?.status).toBe("unknown");
  });
});
