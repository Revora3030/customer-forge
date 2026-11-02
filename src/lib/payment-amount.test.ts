import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRealPaymentAmount, shouldAnnouncePayment, shouldRecordPaidInvoice } from "./payment-amount";

describe("$0 is not a payment", () => {
  it("treats zero, negative, empty and junk amounts as not a payment", () => {
    for (const value of [0, 0.0, "0", "0.00", 0.004, -5, null, undefined, "", "abc", NaN]) {
      expect(isRealPaymentAmount(value), String(value)).toBe(false);
    }
  });

  it("treats a real amount as a payment", () => {
    for (const value of [350, 100, "100.00", 0.5, 0.01]) expect(isRealPaymentAmount(value), String(value)).toBe(true);
  });

  it("never announces a completed $0.00 payment, but still announces failures and real payments", () => {
    expect(shouldAnnouncePayment("completed", 0)).toBe(false);
    expect(shouldAnnouncePayment("completed", 100)).toBe(true);
    expect(shouldAnnouncePayment("failed", 100)).toBe(true);
    expect(shouldAnnouncePayment("failed", 0)).toBe(true);
  });

  it("skips a paid invoice that carried no new money (free first month, setup-only)", () => {
    expect(shouldRecordPaidInvoice(0)).toBe(false);
    expect(shouldRecordPaidInvoice(NaN)).toBe(false);
    expect(shouldRecordPaidInvoice(10000)).toBe(true);
  });
});

describe("the sources of 'Payment received' use the $0 guard", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("the Stripe webhook skips every paid invoice with no money, not only setup-only ones", () => {
    const source = read("src/routes/api/public/payments/webhook.ts");
    expect(source).toContain("shouldRecordPaidInvoice(recordCents)");
    expect(source).not.toContain("setupCents > 0 && recordCents === 0");
  });

  it("recordStripeTransaction and logPaymentActivity do not announce a $0 completion", () => {
    expect(read("src/lib/stripe-billing.server.ts")).toContain("shouldAnnouncePayment(input.status, input.amount)");
    expect(read("src/lib/payments.server.ts")).toContain('kind === "completed" && !isRealPaymentAmount(payment.amount)');
  });

  it("the admin activity feed leaves $0 payments out of the list and the count", () => {
    const source = read("src/lib/admin.functions.ts");
    expect(source.match(/\.gt\("amount", 0\)/g)?.length).toBe(2);
    expect(source).toContain("isRealPaymentAmount(p.amount)");
  });
});
