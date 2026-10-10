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
// One actionable line per skipped suite: what to set to run it. A skip is
// never reported as a pass.
for (const suite of preflight.suites)
  if (!suite.runnable)
    console.log(
      `[live:${suite.id}] SKIPPED (not verified) — set ${suite.missingCredentials.join(", ") || "INTEGRATION_TESTS_ENABLED=1"} to run it.`,
    );

const crmIt = it.skipIf(!liveSuiteEnabled("crm", env));
const emailIt = it.skipIf(!liveSuiteEnabled("email", env));
const paymentsIt = it.skipIf(!liveSuiteEnabled("payments", env));

describe("live CRM hand-off", () => {
  crmIt("accepts a configured test lead and handles an identical replay", async () => {
    const url = env["INTEGRATION_TEST_CRM_WEBHOOK_URL"]!;
    const organizationId = env["INTEGRATION_TEST_CRM_ORGANIZATION_ID"]!;
    const email = env["INTEGRATION_TEST_CRM_EMAIL"]!;
    expect(organizationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    // Exactly the body and headers production sends (buildLeadWebhookPayload +
    // dispatchLeadWebhook in lead-routing.server.ts). Strict receivers
    // validate lead_id / name / email / phone / organization_id and answered
    // HTTP 400 when the old body omitted lead_id and organization_id.
    const { buildLeadWebhookPayload, validateLeadWebhookUrl } = await import("@/lib/lead-routing.server");
    const { guardedFetch } = await import("@/lib/net-guard.server");
    expect(validateLeadWebhookUrl(url)).toBeTruthy();
    const payload = buildLeadWebhookPayload({
      organizationId,
      leadId: crypto.randomUUID(),
      name: "Integration Test",
      email,
      phone: env["INTEGRATION_TEST_CRM_PHONE"] ?? null,
      message: "Revora live integration test - safe to delete.",
      sourceUrl: "https://revoragrowthsystems.com/integration-test",
    });
    const idempotencyKey = payload.idempotency_key;
    const send = () =>
      guardedFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revora-event": payload.event,
          "x-revora-workspace-id": payload.workspace_id,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });

    const first = await send();
    // Never print a receiver body: it may echo workspace data or credentials.
    if (!first.ok) console.log("CRM endpoint replied", first.status);
    expect(first.ok).toBe(true);
    const replay = await send();
    // A correct receiver either accepts idempotently (2xx) or rejects the
    // duplicate (409). HTTP alone cannot prove no duplicate record was created;
    // operators must verify the stable idempotency_key in the receiver.
    expect([200, 201, 202, 204, 409]).toContain(replay.status);
  }, 60_000);
});

describe("live transactional email", () => {
  emailIt("accepts a lead notification for delivery", async () => {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("lead-alert", env["INTEGRATION_TEST_EMAIL_TO"]!, {
      idempotencyKey: `revora-it-email-${Date.now()}`,
      templateData: {
        businessName: "Integration Test",
        leadName: "Integration Test",
        leadEmail: "integration@revoratest.dev",
      },
    });
    expect(result.sent).toBe(true);
  }, 60_000);
});

describe("live payments", () => {
  paymentsIt("creates a sandbox checkout session", async () => {
    // Uses ONLY the sandbox key, never the live STRIPE_SECRET_KEY.
    const { default: Stripe } = await import("stripe");
    const key = env["STRIPE_SANDBOX_API_KEY"]!;
    expect(key.startsWith("sk_test_") || key.startsWith("rk_test_")).toBe(true);
    const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
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
      // Not yet in the SDK types; Stripe requires it for accounts with Managed Payments on.
      ...({ managed_payments: { enabled: false } } as Record<string, unknown>),
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
