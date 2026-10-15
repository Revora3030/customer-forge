import { describe, expect, it } from "vitest";
import { authorizeAcquisitionFollowup, buildAcquisitionPlan, formatRevoraOffer, REVORA_OFFER, scoreAcquisitionLead, type FollowupContext } from "./jarvis-acquisition-policy";

const safeFollowup: FollowupContext = {
  channel: "email", consent: "explicit", optedOut: false, bounced: false, complained: false,
  approvedTemplate: true, verifiedProvider: true, tenantScopeVerified: true, withinQuietHours: true,
  sentInRolling24h: 0, maxPerRolling24h: 3, duplicateIdempotencyKey: false,
  includesUnverifiedClaims: false, includesSensitiveData: false, isBulkColdOutreach: false,
};

describe("Jarvis acquisition policy", () => {
  it("uses the canonical owner-approved offer consistently", () => {
    expect(REVORA_OFFER).toEqual({ setupFeeUsd: 750, firstMonthFree: true, monthlyPriceUsd: 100, trialDays: 1 });
    expect(formatRevoraOffer()).toBe("$750 one-time setup, first month free, then $100/month, with a 1-day full-access trial");
  });
  it("scores a high-intent lead without inventing evidence", () => {
    const score = scoreAcquisitionLead({ requestedQuote: true, hasValidContactRoute: true, serviceAreaMatch: true, recentIntentDays: 0 });
    expect(score.score).toBe(65);
    expect(score.tier).toBe("hot");
    expect(score.recommendedNextStep).toBe("offer_booking");
  });
  it("suppresses opted-out, bounced, complained, and existing-customer records", () => {
    for (const signal of [{ optedOut: true }, { bounced: true }, { complained: true }, { customerAlreadyActive: true }]) {
      expect(scoreAcquisitionLead(signal).recommendedNextStep).toBe("suppress");
    }
  });
  it("does not autonomously nurture unknown consent", () => {
    expect(scoreAcquisitionLead({ consent: "unknown" }).recommendedNextStep).toBe("human_review");
    expect(authorizeAcquisitionFollowup({ ...safeFollowup, consent: "unknown" }).allowed).toBe(false);
  });
  it("allows only a consented, approved, verified, bounded follow-up to queue", () => {
    expect(authorizeAcquisitionFollowup(safeFollowup).allowed).toBe(true);
  });
  it("blocks cold bulk outreach, duplicate sends, claims, and budget overruns", () => {
    const cases: Partial<FollowupContext>[] = [
      { isBulkColdOutreach: true }, { duplicateIdempotencyKey: true }, { includesUnverifiedClaims: true },
      { sentInRolling24h: 3 }, { approvedTemplate: false }, { verifiedProvider: false },
      { tenantScopeVerified: false }, { withinQuietHours: false }, { optedOut: true },
    ];
    for (const patch of cases) expect(authorizeAcquisitionFollowup({ ...safeFollowup, ...patch }).allowed).toBe(false);
  });
  it("blocks a plan whose requested daily budget exceeds approved budget", () => {
    const plan = buildAcquisitionPlan({
      goal: "more_paid_customers", dailyBudgetCents: 1000, approvedDailyBudgetCents: 0,
      funnelHasVerifiedAnalytics: true, websiteAuditAvailable: true, leadCaptureAvailable: true,
      calendarAvailable: true, paymentFlowVerified: true, outboundProviderVerified: true,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.budgetCents).toBe(0);
    expect(plan.steps.every(step => step.mode === "blocked")).toBe(true);
  });
  it("prepares useful work without pretending unconnected systems are live", () => {
    const plan = buildAcquisitionPlan({
      goal: "improve_conversion", dailyBudgetCents: 0, approvedDailyBudgetCents: 0,
      funnelHasVerifiedAnalytics: false, websiteAuditAvailable: true, leadCaptureAvailable: false,
      calendarAvailable: false, paymentFlowVerified: false, outboundProviderVerified: false,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.steps.find(step => step.id === "followup")?.mode).toBe("blocked");
    expect(plan.note).toContain("does not send messages");
  });
});
