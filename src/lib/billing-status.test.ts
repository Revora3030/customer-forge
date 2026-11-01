import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chargedPayments, deriveBillingStatus } from "./billing-status";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const PAST = "2026-09-26T00:00:00Z";
const FUTURE = "2026-11-28T00:00:00Z";

describe("deriveBillingStatus", () => {
  it("never shows an expired trial date as an upcoming renewal", () => {
    const s = deriveBillingStatus({
      setupPaid: false,
      subscription: { status: "trialing", trial_ends_at: PAST, current_period_end: PAST },
      freeAccessEndsAt: Date.parse(PAST),
      now: NOW,
    });
    expect(s.state).toBe("renewal_pending");
    expect(s.label).not.toMatch(/past due/i);
    expect(s.date).toBeNull();
  });
  it("first month free with a future trial end", () => {
    const s = deriveBillingStatus({
      setupPaid: true,
      subscription: { status: "trialing", trial_ends_at: FUTURE },
      now: NOW,
    });
    expect(s).toMatchObject({ state: "first_month_free", date: new Date(FUTURE).toISOString() });
  });
  it("past_due only for a real failed payment", () => {
    expect(
      deriveBillingStatus({ setupPaid: true, subscription: { status: "past_due" }, now: NOW })
        .state,
    ).toBe("past_due");
    const ended = deriveBillingStatus({
      setupPaid: false,
      subscription: null,
      freeAccessEndsAt: NOW - 1000,
      now: NOW,
    });
    expect(ended.state).toBe("free_access_ended");
    expect(ended.label).toBe("Free access ended");
  });
  it("active, canceled, setup paid and free access", () => {
    expect(
      deriveBillingStatus({
        setupPaid: true,
        subscription: { status: "active", current_period_end: FUTURE },
        now: NOW,
      }),
    ).toMatchObject({ state: "active", dateLabel: "Renews" });
    expect(
      deriveBillingStatus({
        setupPaid: true,
        subscription: { status: "active", current_period_end: PAST },
        now: NOW,
      }).date,
    ).toBeNull();
    expect(
      deriveBillingStatus({ setupPaid: true, subscription: { status: "canceled" }, now: NOW })
        .state,
    ).toBe("canceled");
    expect(deriveBillingStatus({ setupPaid: true, subscription: null, now: NOW }).state).toBe(
      "setup_paid",
    );
    expect(
      deriveBillingStatus({ setupPaid: false, freeAccessEndsAt: NOW + 3600_000, now: NOW }).state,
    ).toBe("free_access");
    expect(deriveBillingStatus({ setupPaid: false, now: NOW }).state).toBe("not_started");
  });
  it("the dashboard and /app/billing both use the shared helper", () => {
    expect(readFileSync("src/components/app/StatusCenter.tsx", "utf8")).toContain(
      "deriveBillingStatus(",
    );
    expect(readFileSync("src/routes/_authenticated/app.billing.tsx", "utf8")).toContain(
      "deriveBillingStatus(",
    );
  });
});

describe("calm, accurate cancellation wording", () => {
  it("a trial cancelled during the free month shows no upcoming charge", () => {
    const s = deriveBillingStatus({
      setupPaid: true,
      subscription: { status: "trialing", trial_ends_at: FUTURE, cancel_at_period_end: true },
      now: NOW,
    });
    expect(s).toMatchObject({
      state: "cancel_scheduled",
      label: "Cancellation scheduled",
      tone: "neutral",
      dateLabel: "Access until",
      date: new Date(FUTURE).toISOString(),
    });
    expect(`${s.label} ${s.dateLabel}`).not.toMatch(/charge|renew|cancel(l)?ing/i);
  });
  it("an active plan set to cancel is neutral, not an alarm", () => {
    const s = deriveBillingStatus({
      setupPaid: true,
      subscription: { status: "active", current_period_end: FUTURE, cancel_at_period_end: true },
      now: NOW,
    });
    expect(s).toMatchObject({ state: "cancel_scheduled", tone: "neutral", dateLabel: "Access until" });
    expect(s.date).toBe(new Date(FUTURE).toISOString());
  });
  it("a plan not set to cancel still renews", () => {
    const s = deriveBillingStatus({
      setupPaid: true,
      subscription: { status: "active", current_period_end: FUTURE, cancel_at_period_end: false },
      now: NOW,
    });
    expect(s).toMatchObject({ state: "active", label: "Active", dateLabel: "Renews" });
  });
});

describe("chargedPayments", () => {
  it("never counts a $0.00 row as a payment", () => {
    const rows = [
      { id: "a", amount: 0 },
      { id: "b", amount: "0.00" },
      { id: "c", amount: 100 },
      { id: "d", amount: null },
    ];
    const { charged, hadZeroEntry } = chargedPayments(rows);
    expect(charged.map((r) => r.id)).toEqual(["c"]);
    expect(hadZeroEntry).toBe(true);
  });
  it("is quiet when every row is a real charge, or there are none", () => {
    expect(chargedPayments([{ amount: 350 }]).hadZeroEntry).toBe(false);
    expect(chargedPayments(undefined)).toEqual({ charged: [], hadZeroEntry: false });
  });
});
