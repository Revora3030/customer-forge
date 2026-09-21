import { describe, it, expect } from "vitest";
import {
  isTrialActive,
  trialEndsAtMs,
  trialHoursLeft,
  newTrialEndsAt,
  TRIAL_DAYS,
} from "@/lib/trial";

const DAY = 86_400_000;

/**
 * The free 1-day pass must survive logout/login. Trial state lives entirely on
 * the organization row (trial_ends_at / created_at) and is re-resolved from
 * the database on every sign-in — nothing is stored in the browser session.
 * These tests pin that contract.
 */
describe("cross-session free-access trial", () => {
  it("keeps access on relogin when created less than 1 day ago, even with a null trial_ends_at", () => {
    const createdAt = new Date(Date.now() - DAY).toISOString();
    const org = { subscription_status: "trialing", trial_ends_at: null, created_at: createdAt };
    expect(isTrialActive(org)).toBe(true);
    expect(trialHoursLeft(org)).toBeGreaterThan(0);
  });

  it("keeps access on relogin even if subscription status drifted to past_due/canceled", () => {
    const createdAt = new Date(Date.now() - 2 * DAY).toISOString();
    expect(
      isTrialActive({
        subscription_status: "past_due",
        trial_ends_at: null,
        created_at: createdAt,
      }),
    ).toBe(true);
    expect(
      isTrialActive({
        subscription_status: "canceled",
        trial_ends_at: null,
        created_at: createdAt,
      }),
    ).toBe(true);
  });

  it("uses the explicit trial_ends_at when it is later than the created_at window", () => {
    const createdAt = new Date(Date.now() - 2 * DAY).toISOString();
    const explicitEnd = new Date(Date.now() + 2 * DAY).toISOString();
    const end = trialEndsAtMs({ trial_ends_at: explicitEnd, created_at: createdAt });
    expect(end).toBe(new Date(explicitEnd).getTime());
  });

  it("denies access after the 1-day window has expired", () => {
    const createdAt = new Date(Date.now() - (TRIAL_DAYS + 1) * DAY).toISOString();
    expect(
      isTrialActive({
        subscription_status: "trialing",
        trial_ends_at: null,
        created_at: createdAt,
      }),
    ).toBe(false);
  });

  it("stamps new workspaces with a full 1-day window", () => {
    const from = new Date();
    const end = newTrialEndsAt(from);
    expect(new Date(end).getTime() - from.getTime()).toBe(TRIAL_DAYS * DAY);
  });
});
