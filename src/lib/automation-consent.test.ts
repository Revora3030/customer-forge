import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { automationContactGate, secondsUntilSmsWindow, type ConsentLookups } from "@/lib/automation-consent";

const PHONE = "+15125550100";
const lookups = (over: Partial<ConsentLookups> = {}): ConsentLookups => ({
  isDoNotContact: vi.fn(async () => false),
  hasSmsConsent: vi.fn(async () => true),
  smsAllowedAt: vi.fn(() => true),
  ...over,
});

describe("review request consent gate", () => {
  it("blocks anyone who replied STOP or unsubscribed, on both channels", async () => {
    const blocked = lookups({ isDoNotContact: async () => true });
    expect(await automationContactGate({ action_type: "sms", recipient: PHONE, trigger_event: "review_request" }, blocked)).toEqual({
      ok: false,
      retry: false,
      reason: "recipient_suppressed",
    });
    expect(
      (await automationContactGate({ action_type: "email", recipient: "a@example.com", trigger_event: "review_request" }, blocked)).ok,
    ).toBe(false);
  });

  it("texts a review request only with a recorded SMS opt-in", async () => {
    const noOptIn = lookups({ hasSmsConsent: async () => false });
    expect(await automationContactGate({ action_type: "sms", recipient: PHONE, trigger_event: "review_request" }, noOptIn)).toEqual({
      ok: false,
      retry: false,
      reason: "sms_no_opt_in",
    });
    expect(
      (await automationContactGate({ action_type: "sms", recipient: PHONE, trigger_event: "appointment_completed" }, noOptIn)).ok,
    ).toBe(false);
    // An enquiry reply is not a review request.
    expect((await automationContactGate({ action_type: "sms", recipient: PHONE, trigger_event: "lead_created" }, noOptIn)).ok).toBe(true);
    // Email review requests do not need the SMS opt-in.
    expect(
      (await automationContactGate({ action_type: "email", recipient: "a@example.com", trigger_event: "review_request" }, noOptIn)).ok,
    ).toBe(true);
  });

  it("holds texts during quiet hours and retries when the window opens", async () => {
    const now = new Date("2026-10-21T03:00:00Z");
    const opensAt = new Date("2026-10-21T14:00:00Z").getTime();
    const quiet = lookups({ smsAllowedAt: (when) => when.getTime() >= opensAt });
    const result = await automationContactGate({ action_type: "sms", recipient: PHONE, trigger_event: "review_request" }, quiet, now);
    expect(result).toEqual({ ok: false, retry: true, reason: "sms_quiet_hours", retryAfterSeconds: 11 * 3600 });
  });

  it("caps the quiet-hours wait at a day when no window is found", () => {
    expect(secondsUntilSmsWindow(new Date(), PHONE, () => false)).toBe(86_400);
  });

  it("is wired into the one existing delivery path", () => {
    const messaging = readFileSync("src/lib/messaging.server.ts", "utf8");
    expect(messaging.match(/const gate = await consentGate\(run, /g)).toHaveLength(2);
    const engine = readFileSync("src/lib/automation-engine.ts", "utf8");
    expect(engine).toMatch(/lead_id, appointment_id, trigger_event"\)/);
  });
});
