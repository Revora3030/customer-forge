import { describe, expect, it } from "vitest";
import { reconcileBilling } from "./billing-reconcile";

const org = { id: "o1", name: "Elite", setup_paid_at: "2026-10-31T00:00:00Z", setup_payment_status: "paid" };
const promoPayment = {
  organization_id: "o1",
  environment: "live",
  status: "completed",
  amount: 0,
  description: "Revora Growth System setup fee (promotion code, $350.00 off)",
  metadata: { stripe_id: "setup:cs_1" },
};
const session = { id: "cs_1", status: "complete", payment_status: "paid", amount_total: 0, subscription: "sub_1", metadata: { organizationId: "o1" } };

describe("reconcileBilling", () => {
  it("a promo-code setup that is paid in DB and Stripe is clean", () => {
    const r = reconcileBilling({
      orgs: [org],
      subscriptions: [{ organization_id: "o1", environment: "live", status: "trialing", provider_subscription_id: "sub_1" }],
      payments: [promoPayment],
      stripeSessions: [session],
      stripeSubscriptions: [{ id: "sub_1", status: "trialing" }],
    });
    expect(r.mismatches).toEqual([]);
  });
  it("flags Stripe paid but DB unpaid, and missing subscription", () => {
    const r = reconcileBilling({
      orgs: [{ id: "o1", name: "Elite" }],
      subscriptions: [],
      payments: [],
      stripeSessions: [session],
      stripeSubscriptions: [{ id: "sub_1", status: "trialing" }],
    });
    expect(r.mismatches.map((m) => m.kind).sort()).toEqual(["stripe_paid_db_unpaid", "subscription_missing_in_db"]);
  });
  it("flags DB paid with no Stripe payment, witness disagreement, status drift", () => {
    const r = reconcileBilling({
      orgs: [org],
      subscriptions: [{ organization_id: "o1", environment: "live", status: "active", provider_subscription_id: "sub_9" }],
      payments: [],
      stripeSessions: [],
      stripeSubscriptions: [{ id: "sub_9", status: "past_due" }],
    });
    expect(r.mismatches.map((m) => m.kind).sort()).toEqual([
      "db_paid_no_stripe_payment",
      "setup_witnesses_disagree",
      "subscription_status_mismatch",
    ]);
  });
  it("flags amount mismatch and ignores sandbox rows and demo orgs", () => {
    const r = reconcileBilling({
      orgs: [org, { id: "d", name: "Demo", is_demo: true, setup_payment_status: "paid" }],
      subscriptions: [],
      payments: [{ ...promoPayment, amount: 350 }, { ...promoPayment, organization_id: "d", environment: "sandbox" }],
      stripeSessions: [session],
      stripeSubscriptions: [],
    });
    expect(r.mismatches.some((m) => m.kind === "setup_amount_mismatch")).toBe(true);
    expect(r.mismatches.some((m) => m.workspace === "Demo" && m.kind === "db_paid_no_stripe_payment")).toBe(false);
  });
});
