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
 * The free full-access pass must survive logout/login. Trial state lives entirely on
 * the organization row (trial_ends_at / created_at) and is re-resolved from
 * the database on every sign-in — nothing is stored in the browser session.
 * These tests pin that contract.
 */
describe("cross-session free-access trial", () => {
  it("keeps access on relogin when created less than 1 day ago, even with a null trial_ends_at", () => {
    const createdAt = new Date(Date.now() - DAY / 2).toISOString();
    const org = { subscription_status: "trialing", trial_ends_at: null, created_at: createdAt };
    expect(isTrialActive(org)).toBe(true);
    expect(trialHoursLeft(org)).toBeGreaterThan(0);
  });

  it("keeps access on relogin even if subscription status drifted to past_due/canceled", () => {
    const createdAt = new Date(Date.now() - DAY / 4).toISOString();
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
    // Explicit end must beat created_at + TRIAL_DAYS for this contract to apply.
    const explicitEnd = new Date(Date.now() + (TRIAL_DAYS + 3) * DAY).toISOString();
    const end = trialEndsAtMs({ trial_ends_at: explicitEnd, created_at: createdAt });
    expect(end).toBe(new Date(explicitEnd).getTime());
  });

  it("denies access after the free-access window has expired", () => {
    const createdAt = new Date(Date.now() - (TRIAL_DAYS + 1) * DAY).toISOString();
    expect(
      isTrialActive({
        subscription_status: "trialing",
        trial_ends_at: null,
        created_at: createdAt,
      }),
    ).toBe(false);
  });

  it("stamps new workspaces with a full free-access window", () => {
    const from = new Date();
    const end = newTrialEndsAt(from);
    expect(new Date(end).getTime() - from.getTime()).toBe(TRIAL_DAYS * DAY);
  });

  it("grants access up to the exact trial boundary and denies it one second later", () => {
    // A workspace created exactly TRIAL_DAYS ago (to the second) must still be
    // inside its window only until the boundary instant, not beyond it. This
    // pins the entitlement edge so timezone/clock drift can't quietly extend
    // or shorten the promised free days.
    const createdAt = new Date(Date.now() - TRIAL_DAYS * DAY).toISOString();
    const end = trialEndsAtMs({ trial_ends_at: null, created_at: createdAt });
    expect(end).toBe(new Date(createdAt).getTime() + TRIAL_DAYS * DAY);
    // One second before the boundary: still active.
    const beforeBoundary = {
      trial_ends_at: new Date(Date.now() + 1_000).toISOString(),
      created_at: null,
    };
    expect(isTrialActive(beforeBoundary)).toBe(true);
    // One second after the boundary: locked out.
    const afterBoundary = {
      trial_ends_at: new Date(Date.now() - 1_000).toISOString(),
      created_at: null,
    };
    expect(isTrialActive(afterBoundary)).toBe(false);
    expect(trialHoursLeft(afterBoundary)).toBe(0);
  });

  it("parses ISO 8601 timestamps with timezone offsets instead of assuming local time", () => {
    // Supabase returns timestamptz as ISO 8601 with an explicit offset. If the
    // parser ever assumed local time, a workspace created near midnight UTC
    // would gain or lose hours of trial depending on the server's timezone.
    const createdAt = "2026-01-01T23:59:00+05:30"; // 18:29 UTC
    const end = trialEndsAtMs({ trial_ends_at: null, created_at: createdAt });
    expect(end).toBe(Date.parse(createdAt) + TRIAL_DAYS * DAY);
  });
});
