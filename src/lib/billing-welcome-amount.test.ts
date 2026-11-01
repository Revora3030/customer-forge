import React from "react";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe.server", () => ({
  createStripeClient: () => {
    throw new Error("no network in tests");
  },
}));

import { firstInvoiceSetupPaidLine } from "@/lib/billing-welcome-amount.server";
import { invoicePaidSummary, setupPaidLine } from "@/lib/webhook-invoice";
import { welcomeTemplate } from "@/lib/email-templates/billing-lifecycle";

const html = (data: Record<string, unknown>) =>
  render(
    React.createElement(
      welcomeTemplate.component as React.ComponentType<Record<string, unknown>>,
      data,
    ),
  );

describe("welcome email states the amount actually paid", () => {
  it("says $0.00 paid with a 100%-off promo code", () => {
    const inv = { amount_paid: 0, currency: "usd", total_discount_amounts: [{ amount: 35000 }] };
    expect(setupPaidLine(invoicePaidSummary(inv))).toBe("$0.00 paid (promo code applied)");
  });

  it("says the full setup was received when nothing was discounted", () => {
    const inv = { amount_paid: 35000, currency: "usd", total_discount_amounts: [] };
    expect(setupPaidLine(invoicePaidSummary(inv))).toBe("$350.00 setup payment received");
  });

  it("states no amount when Stripe gave none", () => {
    expect(invoicePaidSummary({})).toBeNull();
    expect(setupPaidLine(null)).toBeNull();
  });

  it("reads an invoice id through the retriever, and returns null on failure", async () => {
    const retrieve = vi.fn(async () => ({
      amount_paid: 17500,
      currency: "usd",
      total_discount_amounts: [{ amount: 17500 }],
    }));
    await expect(firstInvoiceSetupPaidLine("in_123", "live", retrieve)).resolves.toBe(
      "$175.00 paid (promo code applied)",
    );
    expect(retrieve).toHaveBeenCalledWith("in_123");
    await expect(firstInvoiceSetupPaidLine("in_123", "live")).resolves.toBeNull();
    await expect(firstInvoiceSetupPaidLine(null, "live")).resolves.toBeNull();
  });

  it("renders the real line and never a hard-coded $350 for a $0 checkout", async () => {
    const zero = await html({
      planName: "Revora Growth System",
      setupPaidLine: "$0.00 paid (promo code applied)",
    });
    expect(zero).toContain("$0.00 paid (promo code applied).");
    expect(zero).not.toContain("$350 setup payment received");
    const unknown = await html({ planName: "Revora Growth System" });
    expect(unknown).toContain("Your setup is confirmed.");
    expect(unknown).not.toMatch(/\$\d+(\.\d\d)? setup payment received/);
  });
});
