import { afterEach, describe, expect, it, vi } from "vitest";

const checkSentryDelivery = vi.fn(async () => ({ delivered: true }));
vi.mock("@/lib/monitoring.server", () => ({ checkSentryDelivery }));

import { Route } from "@/routes/api/public/sentry-test";

type Handler = (ctx: { request: Request }) => Promise<Response>;
const handlers = ((Route.options as { server?: { handlers?: Record<string, unknown> } }).server?.handlers ?? {}) as Record<string, Handler>;
const url = "https://revoragrowthsystems.com/api/public/sentry-test";

describe("/api/public/sentry-test is locked down", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    checkSentryDelivery.mockClear();
  });

  for (const method of ["GET", "POST"] as const) {
    it(`${method} without a bearer token is 401 and sends nothing to Sentry`, async () => {
      vi.stubEnv("LOVABLE_CRON_SECRET", "test-secret-value");
      const res = await handlers[method]!({ request: new Request(url, { method }) });
      expect(res.status).toBe(401);
      expect(checkSentryDelivery).not.toHaveBeenCalled();
    });

    it(`${method} with a wrong token is rejected`, async () => {
      vi.stubEnv("LOVABLE_CRON_SECRET", "test-secret-value");
      const res = await handlers[method]!({ request: new Request(url, { method, headers: { authorization: "Bearer nope" } }) });
      expect(res.status).not.toBe(200);
      expect(checkSentryDelivery).not.toHaveBeenCalled();
    });
  }

  it("fails closed when the cron secret is not configured", async () => {
    vi.stubEnv("LOVABLE_CRON_SECRET", "");
    const res = await handlers["GET"]!({ request: new Request(url, { headers: { authorization: "Bearer anything" } }) });
    expect(res.status).toBe(500);
    expect(checkSentryDelivery).not.toHaveBeenCalled();
  });

  it("runs the Sentry check only with the correct cron secret", async () => {
    vi.stubEnv("LOVABLE_CRON_SECRET", "test-secret-value");
    const res = await handlers["POST"]!({ request: new Request(url, { method: "POST", headers: { authorization: "Bearer test-secret-value" } }) });
    expect(res.status).toBe(200);
    expect(checkSentryDelivery).toHaveBeenCalledTimes(1);
  });
});
