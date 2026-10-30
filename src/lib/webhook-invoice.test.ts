import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { invoiceSubscriptionId, organizationForStripeSubscription } from "./webhook-invoice";

function fakeAdmin(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, string]> = [];
  const chain = {
    eq: vi.fn((column: string, value: string) => {
      calls.push([column, value]);
      return chain;
    }),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  const admin = {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
  };
  return { admin: admin as never, calls };
}

describe("invoice without workspace metadata", () => {
  it("reads the subscription id across Stripe API versions", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_123" })).toBe("sub_123");
    expect(invoiceSubscriptionId({ subscription: { id: "sub_456" } })).toBe("sub_456");
    expect(
      invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_789" } } }),
    ).toBe("sub_789");
    expect(invoiceSubscriptionId({ subscription: "not-a-sub" })).toBeNull();
    expect(invoiceSubscriptionId(null)).toBeNull();
  });

  it("finds the workspace from the stored subscription in the same environment", async () => {
    const { admin, calls } = fakeAdmin({ data: { organization_id: "org-1" }, error: null });
    await expect(organizationForStripeSubscription(admin, "sub_123", "live")).resolves.toBe(
      "org-1",
    );
    expect(calls).toContainEqual(["provider_subscription_id", "sub_123"]);
    expect(calls).toContainEqual(["environment", "live"]);
    expect(calls).toContainEqual(["payment_provider", "stripe"]);
  });

  it("returns null when nothing matches and throws on a database error so Stripe retries", async () => {
    await expect(
      organizationForStripeSubscription(
        fakeAdmin({ data: null, error: null }).admin,
        "sub_1",
        "live",
      ),
    ).resolves.toBeNull();
    await expect(
      organizationForStripeSubscription(fakeAdmin({ data: null, error: null }).admin, null, "live"),
    ).resolves.toBeNull();
    await expect(
      organizationForStripeSubscription(
        fakeAdmin({ data: null, error: { code: "57014" } }).admin,
        "sub_1",
        "live",
      ),
    ).rejects.toThrow("invoice_subscription_lookup_failed");
  });

  it("the webhook falls back to the lookup and marks setup paid on every column together", () => {
    const webhook = readFileSync("src/routes/api/public/payments/webhook.ts", "utf8");
    expect(webhook).toContain("organizationForStripeSubscription(");
    expect(webhook).toContain("invoiceSubscriptionId(object)");
    const update = webhook.slice(webhook.indexOf("setup_paid_at: new Date().toISOString()"));
    const block = update.slice(0, update.indexOf("})"));
    expect(block).toContain('setup_payment_status: "paid"');
    expect(block).toContain("setup_checkout_session_id");
    expect(block).toContain("plan_id: GROWTH_PLAN_ID");
  });
});
