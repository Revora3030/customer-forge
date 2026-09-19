import { describe, expect, it } from "vitest";
import {
  PRODUCTION_CONTROL_UPGRADES,
  assertSafeTelemetryDimensions,
  canonicalActivationEvent,
  classifyReleaseRisk,
  evaluateEvidence,
  evaluatePublication,
  evaluateTenantOperation,
  redactSensitiveText,
  requiresRollbackEvidence,
} from "./production-control-plane";

describe("production control plane", () => {
  it("keeps the upgrade catalog unique and non-empty", () => {
    expect(PRODUCTION_CONTROL_UPGRADES.length).toBeGreaterThan(20);
    expect(new Set(PRODUCTION_CONTROL_UPGRADES).size).toBe(PRODUCTION_CONTROL_UPGRADES.length);
  });

  it("blocks readiness until every domain is verified", () => {
    const evidence = Object.fromEntries(
      [
        "tenantIsolation",
        "authentication",
        "publishing",
        "generatedSite",
        "rollback",
        "observability",
        "backupRestore",
        "activation",
        "accessibility",
        "performance",
        "seo",
        "billing",
      ].map((key) => [key, "verified"]),
    ) as Parameters<typeof evaluateEvidence>[0];

    expect(evaluateEvidence(evidence).ready).toBe(true);
    expect(evaluateEvidence({ ...evidence, tenantIsolation: "partial" }).ready).toBe(false);
  });

  it("classifies sensitive changes conservatively", () => {
    expect(classifyReleaseRisk({ changesTenantBoundary: true })).toBe("critical");
    expect(classifyReleaseRisk({ changesAuth: true })).toBe("high");
    expect(classifyReleaseRisk({ actionCount: 30 })).toBe("medium");
    expect(requiresRollbackEvidence("critical")).toBe(true);
  });

  it("requires all publication contracts before publishing", () => {
    expect(evaluatePublication({}).publishable).toBe(false);
    expect(
      evaluatePublication({
        "route-integrity": true,
        "meaningful-content": true,
        "placeholder-free": true,
        "conversion-destination": true,
        metadata: true,
        accessibility: true,
        "mobile-layout": true,
        resources: true,
        runtime: true,
        performance: true,
        "tenant-safety": true,
      }).publishable,
    ).toBe(true);
  });

  it("creates a stable activation event identity", () => {
    expect(
      canonicalActivationEvent({
        stage: "trial_started",
        userId: "u",
        organizationId: "o",
        eventId: "evt-1",
      }),
    ).toEqual({ eventId: "evt-1", stage: "trial_started", subjectId: "o" });
    expect(
      canonicalActivationEvent({
        stage: "trial_started",
        userId: null,
        organizationId: null,
        eventId: "evt-1",
      }),
    ).toBeNull();
  });

  it("redacts credentials before telemetry", () => {
    const output = redactSensitiveText("sk_live_secret whsec_secret sb_secret_value Bearer abc");
    expect(output).not.toContain("sk_live_secret");
    expect(output).not.toContain("whsec_secret");
    expect(output).not.toContain("sb_secret_value");
    expect(output).not.toContain("Bearer abc");
  });

  it("detects forbidden telemetry dimensions", () => {
    expect(assertSafeTelemetryDimensions({ requestId: "x", password: "x" })).toEqual(["password"]);
  });

  it("rejects cross-tenant operations", () => {
    expect(
      evaluateTenantOperation({
        authenticated: true,
        requestedOrganizationId: "a",
        membershipOrganizationId: "b",
      }).allowed,
    ).toBe(false);
    expect(
      evaluateTenantOperation({
        authenticated: true,
        requestedOrganizationId: "a",
        membershipOrganizationId: "a",
      }).allowed,
    ).toBe(true);
  });
});
