import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSentryDelivery } from "./monitoring.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("checkSentryDelivery", () => {
  it("reports not configured without a DSN and sends nothing", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await checkSentryDelivery()).toEqual({ configured: false, delivered: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is delivered only when Sentry accepts the envelope", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/42");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await checkSentryDelivery()).toEqual({ configured: true, delivered: true });
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    expect(await checkSentryDelivery()).toEqual({ configured: true, delivered: false });
  });
});
