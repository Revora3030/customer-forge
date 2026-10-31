import { describe, expect, it } from "vitest";
import { clientStatus, type ClientStatusInput } from "./client-status";

const NOW = Date.parse("2026-10-31T12:00:00Z");
const DAY = 86_400_000;
const inDays = (d: number) => new Date(NOW + d * DAY).toISOString();

const base = (): ClientStatusInput => ({
  now: NOW,
  publishState: "published",
  leadsLast14: 4,
  liveDays: 60,
  subscriptionState: "active",
  currentPeriodEnd: inDays(20),
  onboardingCompleted: true,
});
const with_ = (patch: Partial<ClientStatusInput>) => clientStatus({ ...base(), ...patch })!;

describe("clientStatus", () => {
  it("is Healthy with no reasons when everything is fine", () => {
    const s = with_({});
    expect(s.level).toBe("healthy");
    expect(s.label).toBe("Healthy");
    expect(s.reasons).toEqual([]);
  });

  it("returns no badge for a demo workspace", () => {
    expect(clientStatus({ ...base(), isDemo: true, subscriptionState: "past_due" })).toBeNull();
  });

  it("flags an unpublished site as At risk", () => {
    const s = with_({ publishState: "draft", liveDays: null, leadsLast14: 0 });
    expect(s.level).toBe("at_risk");
    expect(s.reasons.map((r) => r.code)).toEqual(["site_not_published"]);
  });

  it("flags no leads in 14 days only after the site has been live a full window", () => {
    expect(with_({ leadsLast14: 0, liveDays: 20 }).reasons.map((r) => r.code)).toEqual(["no_recent_leads"]);
    expect(with_({ leadsLast14: 0, liveDays: 5 }).level).toBe("healthy");
    expect(with_({ leadsLast14: 0, liveDays: null }).level).toBe("healthy");
    expect(with_({ leadsLast14: null, liveDays: 60 }).level).toBe("healthy");
  });

  it("treats past_due and unpaid as Needs attention on their own", () => {
    for (const state of ["past_due", "unpaid", "PAST_DUE"]) {
      const s = with_({ subscriptionState: state });
      expect(s.level).toBe("needs_attention");
      expect(s.reasons[0]?.code).toBe("billing_failed");
    }
    expect(with_({ subscriptionState: "past_due" }).reasons[0]?.text).toBe("Subscription is past due.");
  });

  it("flags a trial ending within 3 days, with a day count", () => {
    const s = with_({ subscriptionState: "trialing", currentPeriodEnd: inDays(2) });
    expect(s.level).toBe("at_risk");
    expect(s.reasons[0]).toMatchObject({ code: "trial_ending", text: "Free trial ends in 2 days." });
    expect(with_({ subscriptionState: "trialing", currentPeriodEnd: inDays(1) }).reasons[0]?.text).toBe("Free trial ends in 1 day.");
  });

  it("does not flag a trial with more than 3 days left, a past trial end, or an active subscription", () => {
    expect(with_({ subscriptionState: "trialing", currentPeriodEnd: inDays(25) }).level).toBe("healthy");
    expect(with_({ subscriptionState: "trialing", currentPeriodEnd: inDays(-1) }).level).toBe("healthy");
    expect(with_({ subscriptionState: "active", currentPeriodEnd: inDays(1) }).level).toBe("healthy");
    expect(with_({ subscriptionState: "trialing", currentPeriodEnd: null }).level).toBe("healthy");
    expect(with_({ subscriptionState: "trialing", currentPeriodEnd: "not a date" }).level).toBe("healthy");
  });

  it("flags unfinished onboarding, but not an unknown onboarding state", () => {
    expect(with_({ onboardingCompleted: false }).reasons.map((r) => r.code)).toEqual(["onboarding_incomplete"]);
    expect(with_({ onboardingCompleted: null }).level).toBe("healthy");
  });

  it("escalates to Needs attention when two or more non-billing problems stack up", () => {
    const s = with_({ publishState: "draft", onboardingCompleted: false });
    expect(s.level).toBe("needs_attention");
    expect(s.reasons.map((r) => r.code)).toEqual(["site_not_published", "onboarding_incomplete"]);
  });

  it("lists every reason, billing first", () => {
    const s = with_({ subscriptionState: "unpaid", publishState: "draft", leadsLast14: 0, liveDays: 40, onboardingCompleted: false });
    expect(s.level).toBe("needs_attention");
    expect(s.reasons.map((r) => r.code)).toEqual(["billing_failed", "site_not_published", "no_recent_leads", "onboarding_incomplete"]);
  });

  it("treats unknown inputs as no reason (nothing guessed)", () => {
    const s = clientStatus({ now: NOW, publishState: null, leadsLast14: null, liveDays: null, subscriptionState: null, currentPeriodEnd: null, onboardingCompleted: null })!;
    expect(s.level).toBe("healthy");
  });
});
