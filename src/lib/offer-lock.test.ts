/**
 * Proves Revora's single commercial offer is immutable in code and that the
 * price verifier refuses everything that is not exactly $750 + $100/month.
 */
import { describe, expect, it } from "vitest";
import { CANONICAL_OFFER_RATES, GROWTH_SYSTEM, verifyGrowthPrices } from "@/lib/offer";
import * as offerModule from "@/lib/offer";

const setup = {
  id: "price_setup",
  lookup_key: GROWTH_SYSTEM.setupPriceKey,
  active: true,
  currency: "usd",
  unit_amount: 75_000,
  type: "one_time",
  recurring: null,
};

const monthly = {
  id: "price_monthly",
  lookup_key: GROWTH_SYSTEM.monthlyPriceKey,
  active: true,
  currency: "usd",
  unit_amount: 10_000,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1 },
};

describe("canonical Revora offer", () => {
  it("is exactly $750 setup, $100/month, 30-day trial, 3-day full access", () => {
    expect(GROWTH_SYSTEM.setupPrice).toBe(750);
    expect(GROWTH_SYSTEM.monthlyPrice).toBe(100);
    expect(GROWTH_SYSTEM.trialDays).toBe(30);
    expect(GROWTH_SYSTEM.fullAccessTrialDays).toBe(3);
    expect(CANONICAL_OFFER_RATES).toEqual({ setupPrice: 750, monthlyPrice: 100 });
  });

  it("is frozen and has no rate-editing helper left in the codebase", () => {
    expect(Object.isFrozen(CANONICAL_OFFER_RATES)).toBe(true);
    expect("parseOfferRates" in offerModule).toBe(false);
  });
});

describe("stripe price verification refuses drift", () => {
  it("accepts only the canonical pair", () => {
    expect(verifyGrowthPrices(setup, monthly)).toEqual({ ok: true });
  });

  it("rejects retired amounts", () => {
    for (const cents of [150_000, 300_000]) {
      expect(verifyGrowthPrices({ ...setup, unit_amount: cents }, monthly).ok).toBe(false);
    }
    expect(verifyGrowthPrices(setup, { ...monthly, unit_amount: 25_000 }).ok).toBe(false);
  });

  it("rejects a non-USD currency", () => {
    expect(verifyGrowthPrices({ ...setup, currency: "eur" }, monthly).ok).toBe(false);
  });

  it("rejects an interval other than one month", () => {
    expect(
      verifyGrowthPrices(setup, { ...monthly, recurring: { interval: "year", interval_count: 1 } })
        .ok,
    ).toBe(false);
    expect(
      verifyGrowthPrices(setup, { ...monthly, recurring: { interval: "month", interval_count: 3 } })
        .ok,
    ).toBe(false);
  });

  it("rejects an inactive price and a recurring setup fee", () => {
    expect(verifyGrowthPrices({ ...setup, active: false }, monthly).ok).toBe(false);
    expect(verifyGrowthPrices({ ...setup, type: "recurring" }, monthly).ok).toBe(false);
  });

  it("ignores caller-supplied rates in favour of nothing weaker than the offer", () => {
    // Even if a caller passes different expectations, the canonical rates are
    // what production uses — the default argument is the frozen offer.
    expect(verifyGrowthPrices(setup, monthly, CANONICAL_OFFER_RATES)).toEqual({ ok: true });
  });
});
