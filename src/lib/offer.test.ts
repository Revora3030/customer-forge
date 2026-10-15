import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEM, verifyGrowthPrices } from "@/lib/offer";

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

describe("canonical offer", () => {
  it("is $750 setup and $100/month", () => {
    expect(GROWTH_SYSTEM.setupPrice).toBe(750);
    expect(GROWTH_SYSTEM.monthlyPrice).toBe(100);
  });
});

describe("verifyGrowthPrices", () => {
  it("accepts prices that match the published offer", () => {
    expect(verifyGrowthPrices(setup, monthly)).toEqual({ ok: true });
  });

  it("rejects a missing price", () => {
    const result = verifyGrowthPrices(null, monthly);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not set up/i);
  });

  it("rejects an archived price", () => {
    const result = verifyGrowthPrices({ ...setup, active: false }, monthly);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/archived/i);
  });

  it("rejects a wrong setup amount and names both amounts", () => {
    const result = verifyGrowthPrices({ ...setup, unit_amount: 150_000 }, monthly);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("$1,500");
      expect(result.reason).toContain("$750");
    }
  });

  it("rejects a wrong monthly amount", () => {
    const result = verifyGrowthPrices(setup, { ...monthly, unit_amount: 25_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("$250");
  });

  it("rejects a non-USD price", () => {
    const result = verifyGrowthPrices(setup, { ...monthly, currency: "eur" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/US dollars/i);
  });

  it("rejects a setup fee configured as recurring", () => {
    const result = verifyGrowthPrices(
      { ...setup, type: "recurring", recurring: { interval: "month", interval_count: 1 } },
      monthly,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/charged once/i);
  });

  it("rejects a monthly price that is not monthly", () => {
    const yearly = verifyGrowthPrices(setup, {
      ...monthly,
      recurring: { interval: "year", interval_count: 1 },
    });
    expect(yearly.ok).toBe(false);

    const quarterly = verifyGrowthPrices(setup, {
      ...monthly,
      recurring: { interval: "month", interval_count: 3 },
    });
    expect(quarterly.ok).toBe(false);
    if (!quarterly.ok) expect(quarterly.reason).toMatch(/once per month/i);
  });

  it("rejects a one-time price used for the subscription", () => {
    const result = verifyGrowthPrices(setup, { ...monthly, type: "one_time", recurring: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not a recurring/i);
  });
});
