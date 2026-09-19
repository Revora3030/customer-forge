import { describe, expect, it } from "vitest";
import { evaluateProductionReadiness, type ReadinessEvidence } from "./production-readiness";

const complete: ReadinessEvidence = {
  tenantIsolation: "verified",
  authenticationBoundary: "verified",
  generatedSiteVerification: "verified",
  rollback: "verified",
  observability: "verified",
  backupRestore: "verified",
  activationMeasurement: "verified",
};

describe("production readiness evidence", () => {
  it("requires every evidence domain to be verified", () => {
    expect(evaluateProductionReadiness(complete)).toEqual({
      ready: true,
      verified: 7,
      partial: 0,
      unverified: 0,
      blockers: [],
    });
  });

  it("does not treat partial or unverified evidence as ready", () => {
    const result = evaluateProductionReadiness({
      ...complete,
      tenantIsolation: "partial",
      observability: "unverified",
    });
    expect(result.ready).toBe(false);
    expect(result.verified).toBe(5);
    expect(result.partial).toBe(1);
    expect(result.unverified).toBe(1);
    expect(result.blockers).toEqual([
      "tenant isolation: partial",
      "observability: unverified",
    ]);
  });

  it("reports blockers deterministically", () => {
    const result = evaluateProductionReadiness({
      ...complete,
      rollback: "unverified",
      backupRestore: "partial",
    });
    expect(result.blockers).toEqual([
      "rollback: unverified",
      "backup/restore: partial",
    ]);
  });
});
