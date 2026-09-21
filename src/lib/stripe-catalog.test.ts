/**
 * The pinned Stripe catalog is the last line of defence against charging a
 * customer the wrong amount: exact Product ID, exact Price ID, exact lookup
 * key, exact amount, exact currency, exact billing type.
 */
import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEM } from "@/lib/offer";
import {
  MONTHLY_PRICE_LOOKUP_KEY,
  SAAS_TAX_CODE,
  SETUP_PRICE_LOOKUP_KEY,
  STRIPE_CATALOG,
  verifyGrowthCatalog,
} from "@/lib/stripe-catalog";

const live = STRIPE_CATALOG.live;

const setupPrice = {
  id: live.setup.stripePriceId,
  product: live.setup.stripeProductId,
  lookup_key: SETUP_PRICE_LOOKUP_KEY,
  active: true,
  currency: "usd",
  unit_amount: 75_000,
  type: "one_time",
  recurring: null,
};
const monthlyPrice = {
  id: live.monthly.stripePriceId,
  product: live.monthly.stripeProductId,
  lookup_key: MONTHLY_PRICE_LOOKUP_KEY,
  active: true,
  currency: "usd",
  unit_amount: 10_000,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1 },
};
const setupProduct = { id: live.setup.stripeProductId, active: true, tax_code: SAAS_TAX_CODE };
const monthlyProduct = { id: live.monthly.stripeProductId, active: true, tax_code: SAAS_TAX_CODE };

const verify = (over: Record<string, unknown> = {}) =>
  verifyGrowthCatalog({
    environment: "live",
    setupPrice,
    monthlyPrice,
    setupProduct,
    monthlyProduct,
    ...over,
  });

describe("Revora Stripe catalog", () => {
  it("pins the real live product ids", () => {
    expect(live.setup.stripeProductId).toBe("prod_V9zmxmIK9gzVz2");
    expect(live.monthly.stripeProductId).toBe("prod_V9zmDZI7XZZhxT");
    expect(live.setup.priceLookupKey).toBe("revora_system_setup");
    expect(live.monthly.priceLookupKey).toBe("revora_system_monthly");
  });

  it("keeps the canonical offer at $750 + $100/month", () => {
    expect(GROWTH_SYSTEM.setupPrice).toBe(750);
    expect(GROWTH_SYSTEM.monthlyPrice).toBe(100);
    expect(GROWTH_SYSTEM.trialDays).toBe(30);
    expect(GROWTH_SYSTEM.fullAccessTrialDays).toBe(1);
  });

  it("accepts the correctly configured catalog", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("rejects a substituted price id", () => {
    expect(verify({ monthlyPrice: { ...monthlyPrice, id: "price_attacker" } }).ok).toBe(false);
    expect(verify({ setupPrice: { ...setupPrice, id: "price_attacker" } }).ok).toBe(false);
  });

  it("rejects a substituted product id", () => {
    expect(verify({ monthlyProduct: { ...monthlyProduct, id: "prod_other" } }).ok).toBe(false);
    expect(verify({ setupPrice: { ...setupPrice, product: "prod_other" } }).ok).toBe(false);
  });

  it("rejects a wrong lookup key", () => {
    expect(verify({ monthlyPrice: { ...monthlyPrice, lookup_key: "revora_pro_monthly" } }).ok).toBe(
      false,
    );
  });

  it("rejects wrong amounts, currency and interval", () => {
    expect(verify({ setupPrice: { ...setupPrice, unit_amount: 150_000 } }).ok).toBe(false);
    expect(verify({ monthlyPrice: { ...monthlyPrice, unit_amount: 25_000 } }).ok).toBe(false);
    expect(verify({ monthlyPrice: { ...monthlyPrice, currency: "eur" } }).ok).toBe(false);
    expect(
      verify({
        monthlyPrice: { ...monthlyPrice, recurring: { interval: "year", interval_count: 1 } },
      }).ok,
    ).toBe(false);
  });

  it("rejects inactive prices and archived products", () => {
    expect(verify({ monthlyPrice: { ...monthlyPrice, active: false } }).ok).toBe(false);
    expect(verify({ monthlyProduct: { ...monthlyProduct, active: false } }).ok).toBe(false);
  });

  it("rejects a recurring setup fee and a one-time monthly price", () => {
    expect(verify({ setupPrice: { ...setupPrice, type: "recurring" } }).ok).toBe(false);
    expect(
      verify({ monthlyPrice: { ...monthlyPrice, type: "one_time", recurring: null } }).ok,
    ).toBe(false);
  });
});
