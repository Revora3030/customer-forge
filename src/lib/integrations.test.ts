import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildIntegrationCards, integrationSummary, type IntegrationFacts } from "./integrations";
import { alertInbox, alertRecipient } from "./lead-alert-recipient";

const base: IntegrationFacts = {
  setupPaymentStatus: "paid",
  subscriptionStatus: "trialing",
  leadAlertsEmail: "owner@example.com",
  leadAlertsEnabled: true,
  lastLeadAlertAt: null,
  customDomain: "example.com",
  domainVerified: true,
  dnsOk: true,
  sslOk: true,
  domainError: null,
  published: true,
  lastPublishedAt: "2026-01-01T00:00:00.000Z",
  seoIndexable: true,
  activeAutomations: 2,
  automationFailures: 0,
  aiGenerationsLast30: 3,
  unavailable: [],
};

describe("integration center", () => {
  it("reports everything connected when the facts say so", () => {
    const cards = buildIntegrationCards(base);
    expect(cards.every((card) => card.status === "connected")).toBe(true);
    expect(integrationSummary(cards).connected).toBe(cards.length);
  });

  it("never claims a domain is live before DNS and HTTPS pass", () => {
    const cards = buildIntegrationCards({ ...base, sslOk: false });
    const domain = cards.find((card) => card.key === "domain")!;
    expect(domain.status).toBe("action_needed");
    expect(domain.action?.to).toBe("/app/domain");
  });

  it("flags unpaid setup and inactive subscriptions", () => {
    const cards = buildIntegrationCards({
      ...base,
      setupPaymentStatus: "unpaid",
      subscriptionStatus: "canceled",
    });
    expect(cards.find((card) => card.key === "payments")!.status).toBe("not_connected");
  });

  it("says a source couldn't be checked instead of guessing", () => {
    const cards = buildIntegrationCards({ ...base, unavailable: ["billing", "website"] });
    expect(cards.find((card) => card.key === "payments")!.status).toBe("unknown");
    expect(cards.find((card) => card.key === "domain")!.status).toBe("unknown");
  });

  it("warns about failed automation deliveries and missing alert emails", () => {
    const failing = buildIntegrationCards({ ...base, automationFailures: 2 });
    expect(failing.find((card) => card.key === "automations")!.detail).toContain("failed");
    const noEmail = buildIntegrationCards({
      ...base,
      leadAlertsEmail: null,
      leadAlertsEnabled: false,
    });
    expect(noEmail.find((card) => card.key === "lead_alerts")!.status).toBe("not_connected");
  });
});

describe("lead alert health follows the newest attempt", () => {
  const alerts = (facts: Partial<IntegrationFacts>) =>
    buildIntegrationCards({ ...base, ...facts }).find((card) => card.key === "lead_alerts")!;

  it("a suppressed inbox after an earlier success needs action, not 'delivered successfully'", () => {
    // Live shape: one sent row, then two newer recipient_suppressed rows. The
    // hook reports the newest row, so the card sees the suppression.
    const card = alerts({
      lastLeadAlertAt: "2026-10-04T13:24:52.000Z",
      lastLeadAlertStatus: "failed",
      lastLeadAlertReason: "recipient_suppressed",
    });
    expect(card.status).toBe("action_needed");
    expect(card.detail).toBe(
      "Alerts to owner@example.com are being refused by that inbox. Add a different notification email.",
    );
    expect(card.detail).not.toContain("delivered successfully");
    expect(card.action?.to).toBe("/app/settings");
  });

  it("any other newest failure is reported with its reason", () => {
    const card = alerts({
      lastLeadAlertAt: "2026-10-04T13:24:52.000Z",
      lastLeadAlertStatus: "failed",
      lastLeadAlertReason: "email_transport_error",
    });
    expect(card.status).toBe("action_needed");
    expect(card.detail).toContain("Last alert failed (email_transport_error)");
    expect(card.detail).not.toContain("delivered successfully");
  });

  it("says delivered only when the newest attempt was sent", () => {
    const sent = alerts({ lastLeadAlertAt: "2026-10-04T13:21:49.000Z", lastLeadAlertStatus: "sent" });
    expect(sent.status).toBe("connected");
    expect(sent.detail).toContain("Last alert delivered successfully.");
    const none = alerts({ lastLeadAlertAt: null, lastLeadAlertStatus: null });
    expect(none.detail).toContain("nothing has been sent");
    expect(none.detail).not.toContain("delivered successfully");
  });

  it("names the same inbox, in the same order, as the real sender", () => {
    const profile = {
      notification_email: "  ",
      owner_email: "owner@acme.test",
      email: "hello@acme.test",
    };
    // The sender prefers email over owner_email; the card must agree.
    expect(alertInbox(profile)).toBe("hello@acme.test");
    expect(alertInbox(profile)).toBe(alertRecipient(profile));
    expect(alertInbox({ notification_email: "not-an-email", owner_email: "owner@acme.test" })).toBe(
      "owner@acme.test",
    );
    // Switched-off alerts still name the inbox so the card can say "switched off".
    expect(alertInbox({ email: "hello@acme.test", notify_on_lead: false })).toBe("hello@acme.test");
    expect(alertRecipient({ email: "hello@acme.test", notify_on_lead: false })).toBeNull();
  });

  it("the Integration Center hook resolves the inbox through the shared helper", () => {
    const hook = readFileSync("src/lib/integrations.hooks.ts", "utf8");
    expect(hook).toContain('import { alertInbox } from "@/lib/lead-alert-recipient";');
    expect(hook).not.toContain('["notification_email", "owner_email", "email"]');
  });
});
