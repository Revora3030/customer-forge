import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONSENT_LOOKUP_RETRY_SECONDS,
  automationContactGate,
  isNorthAmericanNumber,
  secondsUntilSmsWindow,
  type ConsentLookups,
} from "@/lib/automation-consent";

import { automationConsentLookups } from "@/lib/messaging.server";

vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: vi.fn() }));

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
    expect(messaging.match(/const gate = await consentGate\(run, [a-z]+, ctx\)/g)).toHaveLength(2);
    // The old fail-closed-as-answer catches are gone: an error is not "unsubscribed".
    expect(messaging).not.toMatch(/\.catch\(\(\) => true\)|\.catch\(\(\) => false\)/);
    const engine = readFileSync("src/lib/automation-engine.ts", "utf8");
    expect(engine).toMatch(/lead_id, appointment_id, trigger_event"\)/);
  });
});

describe("a failed consent lookup keeps the run queued", () => {
  const down = async () => {
    throw new Error("connection reset");
  };

  it("a do-not-contact read error is retryable, not 'recipient unsubscribed'", async () => {
    for (const action_type of ["email", "sms"]) {
      const result = await automationContactGate(
        { action_type, recipient: action_type === "sms" ? PHONE : "a@example.com", trigger_event: "booking_created" },
        lookups({ isDoNotContact: down }),
      );
      expect(result).toEqual({ ok: false, retry: true, reason: "consent_lookup_unavailable", retryAfterSeconds: CONSENT_LOOKUP_RETRY_SECONDS });
    }
  });

  it("an opt-in read error is retryable, not 'no opt-in'", async () => {
    const result = await automationContactGate(
      { action_type: "sms", recipient: PHONE, trigger_event: "review_request" },
      lookups({ hasSmsConsent: down }),
    );
    expect(result).toMatchObject({ ok: false, retry: true, reason: "consent_lookup_unavailable" });
  });

  it("the engine leaves a retryable outcome queued and pushes it out", () => {
    const engine = readFileSync("src/lib/automation-engine.ts", "utf8");
    const retry = engine.slice(engine.indexOf("if (!outcome.ok && outcome.retry)"), engine.indexOf("const delivered = outcome.ok;"));
    expect(retry).toMatch(/scheduled_for:/);
    expect(retry).not.toMatch(/status:/);
    expect(retry).toMatch(/continue;/);
  });
});

describe("quiet hours and stale reminders", () => {
  it("drops a reminder whose appointment already started, with a clear reason", async () => {
    const now = new Date("2026-10-21T15:00:00Z");
    for (const action_type of ["sms", "email"]) {
      const result = await automationContactGate(
        { action_type, recipient: action_type === "sms" ? PHONE : "a@example.com", trigger_event: "booking_created", appointment_starts_at: "2026-10-21T14:00:00Z" },
        lookups(),
        now,
      );
      expect(result).toEqual({ ok: false, retry: false, reason: "appointment_already_started" });
    }
    // A future appointment's reminder still goes through.
    expect(
      (await automationContactGate({ action_type: "sms", recipient: PHONE, trigger_event: "booking_created", appointment_starts_at: "2026-10-22T14:00:00Z" }, lookups(), now)).ok,
    ).toBe(true);
    // Review requests are about a finished job: its start time doesn't drop them.
    expect(
      (await automationContactGate({ action_type: "email", recipient: "a@example.com", trigger_event: "review_request", appointment_starts_at: "2026-10-20T14:00:00Z" }, lookups(), now)).ok,
    ).toBe(true);
  });

  it("does not text non-+1 numbers (their local time is unknown), failing closed", async () => {
    expect(isNorthAmericanNumber("+15125550100")).toBe(true);
    expect(isNorthAmericanNumber("+447700900123")).toBe(false);
    const allowed = vi.fn(() => true);
    const result = await automationContactGate({ action_type: "sms", recipient: "+447700900123", trigger_event: "lead_created" }, lookups({ smsAllowedAt: allowed }));
    expect(result).toEqual({ ok: false, retry: false, reason: "sms_region_unsupported" });
    expect(allowed).not.toHaveBeenCalled();
  });

  it("quiet hours use the business's state alongside the number's area code", () => {
    const smsAllowedNow = vi.fn(() => true);
    const built = automationConsentLookups(
      { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
      { normalizeContact: (v) => ({ value: String(v), kind: "phone" }), smsAllowedNow },
      "WA",
    );
    const when = new Date("2026-10-21T18:00:00Z");
    built.smsAllowedAt(when, PHONE);
    expect(smsAllowedNow).toHaveBeenCalledWith(when, "WA", PHONE);
    const messaging = readFileSync("src/lib/messaging.server.ts", "utf8");
    expect(messaging).toMatch(/automationConsentLookups\(supabaseAdmin as never, outreach, ctx\.businessState \?\? null\)/);
    const runner = readFileSync("src/lib/automations.functions.ts", "utf8");
    expect(runner).toMatch(/businessState: profile\?\.state \?\? null/);
  });
});

describe("strict consent lookups (messaging.server)", () => {
  const helpers = {
    normalizeContact: (v: unknown) =>
      String(v).includes("@") ? { value: String(v).toLowerCase(), kind: "email" as const } : { value: String(v), kind: "phone" as const },
    smsAllowedNow: () => true,
  };
  const db = (result: { data: unknown; error: { message: string } | null }, seen: string[] = []) => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, value: string) => {
          seen.push(`${table}:${value}`);
          return { maybeSingle: async () => result };
        },
      }),
    }),
  });

  it("answers from the lists by exact normalized value", async () => {
    const seen: string[] = [];
    const listed = automationConsentLookups(db({ data: { value: "a@example.com", sms: true }, error: null }, seen), helpers);
    expect(await listed.isDoNotContact("A@Example.com")).toBe(true);
    expect(await listed.hasSmsConsent(PHONE)).toBe(true);
    expect(seen).toEqual(["prospect_do_not_contact:a@example.com", `prospect_contact_consent:${PHONE}`]);
    const clear = automationConsentLookups(db({ data: null, error: null }), helpers);
    expect(await clear.isDoNotContact("a@example.com")).toBe(false);
    expect(await clear.hasSmsConsent(PHONE)).toBe(false);
  });

  it("throws on a read error so the gate retries instead of answering", async () => {
    const broken = automationConsentLookups(db({ data: null, error: { message: "timeout" } }), helpers);
    await expect(broken.isDoNotContact("a@example.com")).rejects.toThrow(/consent lookup failed/);
    await expect(broken.hasSmsConsent(PHONE)).rejects.toThrow(/consent lookup failed/);
    expect(await automationContactGate({ action_type: "email", recipient: "a@example.com", trigger_event: "booking_created" }, broken)).toMatchObject({
      retry: true,
      reason: "consent_lookup_unavailable",
    });
  });
});
