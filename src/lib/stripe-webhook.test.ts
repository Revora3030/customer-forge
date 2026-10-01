/**
 * Payment webhook signature verification.
 *
 * The webhook is the only path that can activate a paying Revora account, and
 * it is publicly reachable, so its signature check is the entire security
 * boundary. These tests sign payloads with a known test secret and prove that
 * a forged, tampered, replayed or wrongly-signed event is rejected.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveStripeWebhookEnv, verifyWebhook } from "@/lib/stripe.server";

const SANDBOX_SECRET = "whsec_test_sandbox_secret";
const LIVE_SECRET = "whsec_test_live_secret";

async function sign(body: string, secret: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return Buffer.from(new Uint8Array(signed)).toString("hex");
}

async function request(
  body: string,
  options: { secret?: string; timestamp?: number; header?: string } = {},
) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const header =
    options.header ??
    `t=${timestamp},v1=${await sign(body, options.secret ?? SANDBOX_SECRET, timestamp)}`;
  return new Request("https://revora.test/api/public/payments/webhook?env=sandbox", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

const eventBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 75000 } },
    ...overrides,
  });

describe("payment webhook environment resolution", () => {
  it("defaults the canonical production endpoint to live", () => {
    expect(resolveStripeWebhookEnv(null)).toBe("live");
    expect(resolveStripeWebhookEnv("")).toBe("live");
    expect(resolveStripeWebhookEnv("live")).toBe("live");
  });

  it("honors an explicit sandbox marker", () => {
    expect(resolveStripeWebhookEnv("sandbox")).toBe("sandbox");
  });

  it("uses Stripe livemode when the URL marker is missing or unrecognized", () => {
    expect(resolveStripeWebhookEnv(null, true)).toBe("live");
    expect(resolveStripeWebhookEnv(null, false)).toBe("sandbox");
    expect(resolveStripeWebhookEnv("production", true)).toBe("live");
    expect(resolveStripeWebhookEnv("production", false)).toBe("sandbox");
  });

  it("defaults to live when neither URL nor payload identifies an environment", () => {
    expect(resolveStripeWebhookEnv(null)).toBe("live");
    expect(resolveStripeWebhookEnv("")).toBe("live");
    expect(resolveStripeWebhookEnv("production")).toBe("live");
  });
});

describe("payment webhook signature verification", () => {
  beforeEach(() => {
    delete process.env["Stripelivewebhook"];
    delete process.env["STRIPE_WEBHOOK_SECRET"];
    delete process.env["STRIPE_LIVE_WEBHOOK_SECRET"];
    delete process.env["STRIPE_SANDBOX_WEBHOOK_SECRET"];
    process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"] = SANDBOX_SECRET;
    process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"] = LIVE_SECRET;
  });

  it("accepts a correctly signed event", async () => {
    const body = eventBody();
    const event = await verifyWebhook(await request(body), "sandbox");
    expect(event.type).toBe("checkout.session.completed");
    expect(event.id).toBe("evt_test_1");
    expect(event.data.object.amount_total).toBe(75000);
  });

  it("rejects an unsigned request", async () => {
    const body = eventBody();
    const req = new Request("https://revora.test/hook", { method: "POST", body });
    await expect(verifyWebhook(req, "sandbox")).rejects.toThrow(/signature/i);
  });

  it("rejects a malformed signature header", async () => {
    await expect(
      verifyWebhook(await request(eventBody(), { header: "garbage" }), "sandbox"),
    ).rejects.toThrow(/Invalid signature format/);
  });

  it("rejects a body tampered with after signing", async () => {
    const original = eventBody();
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=${await sign(original, SANDBOX_SECRET, timestamp)}`;
    // Same signature, but the amount has been inflated in transit.
    const tampered = eventBody({
      data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 1 } },
    });
    await expect(verifyWebhook(await request(tampered, { header }), "sandbox")).rejects.toThrow(
      /Invalid webhook signature/,
    );
  });

  it("rejects an event signed with the wrong secret", async () => {
    await expect(
      verifyWebhook(await request(eventBody(), { secret: "whsec_attacker" }), "sandbox"),
    ).rejects.toThrow(/Invalid webhook signature/);
  });

  it("rejects a non-numeric signature timestamp", async () => {
    const body = eventBody();
    await expect(
      verifyWebhook(
        await request(body, { header: `t=not-a-number,v1=${"0".repeat(64)}` }),
        "sandbox",
      ),
    ).rejects.toThrow(/Invalid signature timestamp/);
  });

  it("rejects a replayed event outside the timestamp window", async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    await expect(
      verifyWebhook(await request(eventBody(), { timestamp: stale }), "sandbox"),
    ).rejects.toThrow(/timestamp too old/i);
  });

  it("does not accept a live-signed event on the sandbox endpoint", async () => {
    await expect(
      verifyWebhook(await request(eventBody(), { secret: LIVE_SECRET }), "sandbox"),
    ).rejects.toThrow(/Invalid webhook signature/);
  });

  it("accepts a live event signed with the Stripelivewebhook fallback secret", async () => {
    delete process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"];
    process.env["Stripelivewebhook"] = "whsec_fallback_live";

    const body = JSON.stringify({
      ...JSON.parse(eventBody()),
      livemode: true,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=${await sign(body, "whsec_fallback_live", timestamp)}`;
    const req = new Request("https://revora.test/api/public/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body,
    });

    const event = await verifyWebhook(req, "live");
    expect(event.type).toBe("checkout.session.completed");
    expect(event.livemode).toBe(true);
  });

  it("accepts a live event signed with the STRIPE_WEBHOOK_SECRET fallback", async () => {
    delete process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"];
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_fallback_live_2";

    const body = eventBody({ livemode: true });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=${await sign(body, "whsec_fallback_live_2", timestamp)}`;
    const req = new Request("https://revora.test/api/public/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body,
    });

    await expect(verifyWebhook(req, "live")).resolves.toMatchObject({
      type: "checkout.session.completed",
      livemode: true,
    });
  });

  it("accepts a sandbox event signed with the sandbox fallback secret", async () => {
    delete process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"];
    process.env["STRIPE_SANDBOX_WEBHOOK_SECRET"] = "whsec_fallback_sandbox";

    const body = eventBody({ livemode: false });
    const timestamp = Math.floor(Date.now() / 1000);
    const header = `t=${timestamp},v1=${await sign(body, "whsec_fallback_sandbox", timestamp)}`;
    const req = new Request("https://revora.test/api/public/payments/webhook", {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body,
    });

    const event = await verifyWebhook(req, "sandbox");
    expect(event.livemode).toBe(false);
  });

  it("accepts a live-signed event on the live endpoint", async () => {
    const event = await verifyWebhook(await request(eventBody(), { secret: LIVE_SECRET }), "live");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("fails closed when the signing secret is not configured", async () => {
    delete process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"];
    await expect(verifyWebhook(await request(eventBody()), "sandbox")).rejects.toThrow(
      /Webhook secret is not configured for environment: sandbox/,
    );
  });
});
