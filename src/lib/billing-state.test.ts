import { describe, expect, it } from "vitest";
import {
  dollarsToCents,
  isSetupPaymentRow,
  resolveSetupPaid,
  summarizePayments,
} from "./billing-state";

const promoRow = {
  status: "completed",
  amount: 0,
  description: "Revora Growth System setup fee (promotion code, $350.00 off)",
  metadata: { stripe_id: "setup:cs_live_x" },
};
const fullRow = {
  status: "completed",
  amount: 350,
  description: "Revora Growth System setup fee",
  metadata: { stripe_id: "setup:cs_live_y" },
};
const paidOrg = { setup_paid_at: "2026-10-31T20:00:00Z", setup_payment_status: "paid" };

describe("resolveSetupPaid (dashboard vs /app/billing contradiction)", () => {
  it("promo-code $0 setup: workspace paid + $0 row is paid on both screens", () => {
    const r = resolveSetupPaid({ org: paidOrg, payments: [promoRow] });
    expect(r).toMatchObject({ setupPaid: true, source: "both", witnessesDisagree: false, setupFullyDiscounted: true });
  });
  it("the old exact-description lookup missed promo rows; the helper does not", () => {
    expect(isSetupPaymentRow(promoRow)).toBe(true);
    expect(resolveSetupPaid({ org: null, payments: [promoRow] }).setupPaid).toBe(true);
  });
  it("workspace columns alone (webhook wrote org, row missing) still read paid, flagged", () => {
    const r = resolveSetupPaid({ org: paidOrg, payments: [] });
    expect(r).toMatchObject({ setupPaid: true, source: "workspace", witnessesDisagree: true });
  });
  it("full-price paid row", () => {
    expect(resolveSetupPaid({ org: paidOrg, payments: [fullRow] }).setupFullyDiscounted).toBe(false);
  });
  it("unpaid: nothing completed, started or failed rows do not count", () => {
    expect(resolveSetupPaid({ org: { setup_payment_status: "checkout_started" }, payments: [] }).setupPaid).toBe(false);
    expect(resolveSetupPaid({ org: null, payments: [{ ...fullRow, status: "failed" }] })).toMatchObject({
      setupPaid: false,
      source: "none",
      witnessesDisagree: false,
    });
  });
  it("a non-setup completed payment is not a setup witness", () => {
    expect(
      resolveSetupPaid({ org: null, payments: [{ status: "completed", amount: 100, description: "Monthly", metadata: { stripe_id: "in_1" } }] }).setupPaid,
    ).toBe(false);
  });
});

describe("summarizePayments", () => {
  it("counts completed only, in integer cents", () => {
    expect(summarizePayments([promoRow, { ...fullRow, amount: "0.1" }, { ...fullRow, amount: 0.2 }, { status: "failed", amount: 99 }])).toEqual({
      paidCount: 3,
      paidCents: 30,
    });
    expect(dollarsToCents("350.00")).toBe(35000);
    expect(dollarsToCents(null)).toBe(0);
  });
});
