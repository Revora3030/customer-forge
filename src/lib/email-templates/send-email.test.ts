import { beforeEach, describe, expect, it, vi } from "vitest";

const sendLovableEmail = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock("@lovable.dev/email-js", () => ({
  EmailAPIError: class EmailAPIError extends Error {},
  sendLovableEmail: (...args: unknown[]) => sendLovableEmail(...args),
}));

import { REVORA } from "@/lib/brand";
import { resolveReplyTo, sendTemplateEmail } from "./send-email";
import { TEMPLATES } from "./registry";

describe("resolveReplyTo", () => {
  it("keeps an explicit Reply-To", () => {
    expect(resolveReplyTo("billing-welcome", "owner@example.com")).toBe("owner@example.com");
  });

  it("gives Revora-own billing and lifecycle emails Revora's support address", () => {
    for (const name of ["billing-welcome", "billing-payment-failed", "lifecycle-winback", "lifecycle-site-ready"]) {
      expect(resolveReplyTo(name)).toBe(REVORA.email);
    }
  });

  it("leaves client-facing templates without a default so replies never reach Revora by mistake", () => {
    for (const name of ["lead-alert", "lead-confirmation", "automation-message", "prospect-demo", "founder-alert"]) {
      expect(resolveReplyTo(name)).toBeUndefined();
    }
  });

  it("every template given the default exists in the registry; the internal sale alert does not get it", () => {
    const withDefault = Object.keys(TEMPLATES).filter((n) => resolveReplyTo(n) === REVORA.email);
    expect(withDefault.length).toBe(11);
    expect(resolveReplyTo("billing-sale-alert")).toBeUndefined();
  });
});

describe("sendTemplateEmail reply_to", () => {
  beforeEach(() => {
    sendLovableEmail.mockClear();
    process.env["LOVABLE_API_KEY"] = "test-key";
  });

  it("sends reply_to for a Revora billing email and keeps the no-reply From", async () => {
    await sendTemplateEmail("billing-trial-ending", "owner@example.com", {
      templateData: { businessName: "Test Co", trialEndsOn: "Nov 5", billingUrl: "https://example.com/app/billing" },
    });
    const payload = sendLovableEmail.mock.calls[0]?.[0] as Record<string, string>;
    expect(payload["reply_to"]).toBe(REVORA.email);
    expect(payload["from"]).toContain("noreply@notify.");
  });

  it("does not add reply_to to an automation email without one", async () => {
    await sendTemplateEmail("automation-message", "x@example.com", {
      templateData: { businessName: "Test Co", heading: "Hi", message: "Hello", signoff: "Test" },
    });
    const payload = sendLovableEmail.mock.calls[0]?.[0] as Record<string, string>;
    expect("reply_to" in payload).toBe(false);
  });
});
