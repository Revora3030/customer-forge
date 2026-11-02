import { describe, expect, it } from "vitest";
import { buildRevenueCard, mismatchCountsByWorkspace } from "./revenue-card";

const setupRow = (org: string, amount: number, extra = {}) => ({
  organization_id: org, environment: "live", status: "completed", amount,
  description: "Revora Growth System setup fee", metadata: { stripe_id: `setup:cs_${org}` }, ...extra,
});

describe("buildRevenueCard", () => {
  it("counts setup fees and active subscriptions from webhook records, in integer cents", () => {
    const card = buildRevenueCard({
      orgs: [
        { id: "a", name: "Alpha", setup_paid_at: "2026-10-01", subscription_status: "active" },
        { id: "b", name: "Beta", setup_payment_status: "paid", subscription_status: "trialing" },
        { id: "c", name: "Gamma" },
      ],
      payments: [setupRow("a", 350.1), setupRow("b", 0, { description: "Revora Growth System setup fee (promotion code, $350.00 off)" })],
      subscriptions: [{ organization_id: "a", status: "active", provider_subscription_id: "sub_1" }, { organization_id: "b", status: "trialing", provider_subscription_id: "sub_2" }],
    });
    expect(card.setup).toEqual({ paidWorkspaces: 2, fullyDiscountedWorkspaces: 1, collectedCents: 35010, refundedCents: 0 });
    expect(card.subscriptions).toEqual({ active: 1, trialing: 1, pastDue: 0 });
    expect(card.mismatches).toEqual([]);
  });

  it("ignores demo workspaces and sandbox rows", () => {
    const card = buildRevenueCard({
      orgs: [{ id: "a", name: "A", is_demo: true, setup_paid_at: "x" }, { id: "b", name: "B" }],
      payments: [setupRow("b", 350, { environment: "sandbox" })],
      subscriptions: [{ organization_id: "b", environment: "sandbox", status: "active", provider_subscription_id: "s" }],
    });
    expect(card.workspaces).toBe(1);
    expect(card.setup.paidWorkspaces).toBe(0);
    expect(card.subscriptions.active).toBe(0);
  });

  it("flags only disagreements the database can prove", () => {
    const card = buildRevenueCard({
      orgs: [
        { id: "a", name: "Alpha", setup_paid_at: "x", subscription_status: "active" },
        { id: "b", name: "Beta", subscription_status: "canceled" },
      ],
      payments: [setupRow("b", 350)],
      subscriptions: [
        { organization_id: "b", status: "active", provider_subscription_id: null },
        { organization_id: "b", status: "active", provider_subscription_id: "sub_x" },
      ],
    });
    const kinds = card.mismatches.map((m) => `${m.workspace}:${m.kind}`).sort();
    expect(kinds).toEqual([
      "Alpha:setup_witnesses_disagree",
      "Alpha:workspace_active_no_active_subscription",
      "Beta:active_subscription_without_stripe_id",
      "Beta:active_subscription_workspace_not_active",
      "Beta:duplicate_active_subscriptions",
      "Beta:setup_witnesses_disagree",
    ]);
    expect(mismatchCountsByWorkspace(card.mismatches)).toEqual([{ workspace: "Beta", count: 4 }, { workspace: "Alpha", count: 2 }]);
  });

  it("subtracts nothing silently: refunds are shown separately", () => {
    const card = buildRevenueCard({ orgs: [{ id: "a", name: "A" }], payments: [setupRow("a", 350, { refunded_amount: 100 })], subscriptions: [] });
    expect(card.setup.collectedCents).toBe(35000);
    expect(card.setup.refundedCents).toBe(10000);
  });
});
