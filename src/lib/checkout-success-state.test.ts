import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-checkout success state (Phase A item 7)", () => {
  const welcome = readFileSync("src/routes/_authenticated/app.welcome.tsx", "utf8");
  const billing = readFileSync("src/routes/_authenticated/app.billing.tsx", "utf8");

  it("welcome shows a clear activating state instead of 'taking longer than expected'", () => {
    expect(welcome).toContain("Payment received — we're activating your account");
    expect(welcome).not.toContain("taking longer than expected");
    expect(welcome).toContain("confirmationTimedOut && !activating");
  });

  it("billing shows a success banner and keeps polling the verified state", () => {
    expect(billing).toContain("Payment received — we're activating your plan.");
    expect(billing).toContain("Payment confirmed — your plan is active.");
    expect(billing).toContain("startConfirmationPolling(");
  });
});
