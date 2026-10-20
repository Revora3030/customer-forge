import { describe, expect, it } from "vitest";
import { explicitlySelectedLiveSuite, liveSuiteEnabled } from "./live-credentials";

describe("explicit external integration test selection", () => {
  it("does not authorize email or billing from a general regression command", () => {
    const enabled = explicitlySelectedLiveSuite(["bun", "vitest", "run"]);
    const env = { INTEGRATION_TESTS_ENABLED: enabled ? "1" : "0", LOVABLE_API_KEY: "fixture", INTEGRATION_TEST_EMAIL_TO: "fixture@example.test", STRIPE_SANDBOX_API_KEY: "fixture", PAYMENTS_SANDBOX_WEBHOOK_SECRET: "fixture" };
    expect(enabled).toBe(false);
    expect(liveSuiteEnabled("email", env)).toBe(false);
    expect(liveSuiteEnabled("payments", env)).toBe(false);
  });
  it("only permits the explicitly named integration file to use the credential gate", () => {
    expect(explicitlySelectedLiveSuite(["vitest", "run", "src/lib/integrations/live.integration.test.ts"])).toBe(true);
    expect(explicitlySelectedLiveSuite(["vitest", "run", "src/lib/integrations"])).toBe(false);
    expect(explicitlySelectedLiveSuite(["vitest", "run", "live.integration"])).toBe(false);
  });
});