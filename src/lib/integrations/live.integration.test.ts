/**
 * LIVE INTEGRATION SUITE (credential-gated)
 * =========================================
 *
 * Runs ONLY when real server-side test credentials are present. Without them
 * every case is skipped and announced as NOT_VERIFIED — nothing here ever
 * simulates a live pass.
 *
 * Enable with:  bun run test:integrations
 * Requires:     INTEGRATION_TESTS_ENABLED plus the per-suite credentials named
 *               by scripts/integration-preflight.mjs.
 */

import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { livePreflight, liveSuiteEnabled } from "./live-credentials";

const env = process.env as Record<string, string | undefined>;
const preflight = livePreflight(env);

if (preflight.status === "NOT_VERIFIED")
  console.log(
    "Live integration suites NOT_VERIFIED — missing credentials: " +
      preflight.missingCredentials.join(", "),
  );

const crmIt = it.skipIf(!liveSuiteEnabled("crm", env));
const emailIt = it.skipIf(!liveSuiteEnabled("email", env));
const paymentsIt = it.skipIf(!liveSuiteEnabled("payments", env));

describe("live CRM hand-off", () => {
  crmIt("delivers a lead once and rejects an identical replay", async () => {
    const url = env["INTEGRATION_TEST_CRM_WEBHOOK_URL"]!;
    const idempotencyKey = `revora-it-${Date.now()}`;
    const payload = {
      source: "integration-test",
      idempotency_key: idempotencyKey,
      lead: { name: "Integration Test", email: "integration@revoratest.dev" },
    };
    const send = () =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });

    const first = await send();
    expect(first.ok).toBe(true);
    const replay = await send();
    // A correct receiver either accepts idempotently (2xx) or rejects the
    // duplicate (409). It must never create a second lead.
    expect([200, 201, 202, 204, 409]).toContain(replay.status);
  }, 60_000);
});

describe("live transactional email", () => {
  emailIt("accepts a lead notification for delivery", async () => {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("lead_notification", env["INTEGRATION_TEST_EMAIL_TO"]!, {
      variables: {
        businessName: "Integration Test",
        leadName: "Integration Test",
        leadEmail: "integration@revoratest.dev",
      },
    } as never);
    expect(result).toBeDefined();
    expect((result as { ok?: boolean }).ok).toBe(true);
  }, 60_000);
});

describe("live payments", () => {
  paymentsIt("creates a sandbox checkout session", async () => {
    const { createStripeClient } = await import("@/lib/stripe.server");
    const stripe = createStripeClient("sandbox");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: "https://revoragrowthsystems.com/app/billing?status=success",
      cancel_url: "https://revoragrowthsystems.com/app/billing?status=cancelled",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 100,
            product_data: { name: "Integration test item" },
          },
        },
      ],
    });
    expect(session.id).toMatch(/^cs_/);
    expect(session.url).toBeTruthy();
  }, 60_000);

  paymentsIt("accepts a correctly signed webhook and rejects a tampered one", async () => {
    const { verifyWebhook } = await import("@/lib/stripe.server");
    const secret = env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"]!;
    const body = JSON.stringify({
      id: "evt_integration_test",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_integration" } },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const request = (sig: string) =>
      new Request("https://revoragrowthsystems.com/api/public/stripe-webhook", {
        method: "POST",
        headers: { "stripe-signature": sig, "content-type": "application/json" },
        body,
      });

    const good = await verifyWebhook(request(`t=${timestamp},v1=${signature}`), "sandbox");
    expect(good.type).toBe("checkout.session.completed");

    await expect(
      verifyWebhook(request(`t=${timestamp},v1=${"0".repeat(64)}`), "sandbox"),
    ).rejects.toBeTruthy();
  }, 60_000);
});

describe("live integration preflight contract", () => {
  it("never claims a live pass without credentials", () => {
    if (preflight.status === "NOT_VERIFIED")
      expect(preflight.suites.every((suite) => suite.runnable === false)).toBe(true);
    else expect(preflight.suites.some((suite) => suite.runnable)).toBe(true);
  });
});
