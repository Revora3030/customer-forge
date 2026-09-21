import { describe, expect, it } from "vitest";
import { LIVE_SUITES, livePreflight, suiteStatus } from "./live-credentials";

describe("live integration credential contract", () => {
  it("reports NOT_VERIFIED with an empty environment and never invents success", () => {
    const report = livePreflight({});
    expect(report.status).toBe("NOT_VERIFIED");
    expect(report.suites.every((s) => s.runnable === false)).toBe(true);
    expect(report.missingCredentials).toContain("INTEGRATION_TESTS_ENABLED");
  });

  it("reports credential names only, never values", () => {
    const report = livePreflight({ STRIPE_SANDBOX_API_KEY: "sk_test_do_not_leak" });
    const serialised = JSON.stringify(report);
    expect(serialised).not.toContain("sk_test_do_not_leak");
    expect(serialised).toContain("PAYMENTS_SANDBOX_WEBHOOK_SECRET");
  });

  it("treats a blank credential as missing", () => {
    const contract = LIVE_SUITES.find((s) => s.id === "crm")!;
    const status = suiteStatus(contract, {
      INTEGRATION_TESTS_ENABLED: "1",
      INTEGRATION_TEST_CRM_WEBHOOK_URL: "   ",
    });
    expect(status.runnable).toBe(false);
    expect(status.missingCredentials).toEqual(["INTEGRATION_TEST_CRM_WEBHOOK_URL"]);
  });

  it("marks one suite runnable and the whole preflight PARTIAL", () => {
    const report = livePreflight({
      INTEGRATION_TESTS_ENABLED: "1",
      INTEGRATION_TEST_CRM_WEBHOOK_URL: "https://example.test/hook",
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.suites.find((s) => s.id === "crm")?.runnable).toBe(true);
    expect(report.suites.find((s) => s.id === "payments")?.runnable).toBe(false);
  });

  it("requires the explicit opt-in flag even when provider credentials exist", () => {
    const report = livePreflight({
      LOVABLE_API_KEY: "present",
      INTEGRATION_TEST_EMAIL_TO: "qa@example.test",
    });
    expect(report.suites.find((s) => s.id === "email")?.runnable).toBe(false);
    expect(report.suites.find((s) => s.id === "email")?.missingCredentials).toEqual([
      "INTEGRATION_TESTS_ENABLED",
    ]);
  });

  it("states what each suite would prove", () => {
    for (const suite of LIVE_SUITES) expect(suite.proves.length).toBeGreaterThan(0);
  });
});
