import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware: () => ({ handler: () => () => undefined }), handler: () => () => undefined }),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/revenue-card.functions", () => ({ getRevenueCard: () => undefined }));

import { RevenueCardView } from "./RevenueCard";

describe("RevenueCardView", () => {
  it("shows counts, dollars and the workspaces that disagree, and says it never contacts Stripe", () => {
    const html = renderToStaticMarkup(
      <RevenueCardView
        data={{
          workspaces: 3,
          setup: { paidWorkspaces: 2, fullyDiscountedWorkspaces: 1, collectedCents: 35000, refundedCents: 0 },
          subscriptions: { active: 1, trialing: 1, pastDue: 0 },
          mismatches: [{ workspace: "Alpha", kind: "setup_witnesses_disagree", detail: "workspace says setup paid, but there is no completed setup payment row" }],
        }}
      />,
    );
    expect(html).toContain("$350.00");
    expect(html).toContain("1 fully discounted");
    expect(html).toContain("Alpha");
    expect(html).toContain("never contacts Stripe");
  });
  it("says so when nothing disagrees", () => {
    const html = renderToStaticMarkup(
      <RevenueCardView data={{ workspaces: 0, setup: { paidWorkspaces: 0, fullyDiscountedWorkspaces: 0, collectedCents: 0, refundedCents: 0 }, subscriptions: { active: 0, trialing: 0, pastDue: 0 }, mismatches: [] }} />,
    );
    expect(html).toContain("No disagreements");
  });
});
