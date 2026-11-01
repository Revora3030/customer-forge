import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendFounderAlert = vi.fn(async () => "sent" as const);
vi.mock("@/lib/founder-alerts.server", () => ({ sendFounderAlert: (...args: unknown[]) => (sendFounderAlert as (...a: unknown[]) => unknown)(...args) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({}) } }));

import { gatewayCreditsMarker, isGatewayCreditsStop, noteGatewayCreditsStop, resetGatewayCreditsAlertForTests } from "./gateway-credits-alert.server";

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));
const credits = { status: 402, category: "quota" as const, provider: "lovable", detail: null };

describe("gateway credits alert", () => {
  beforeEach(() => {
    resetGatewayCreditsAlertForTests();
    sendFounderAlert.mockReset().mockResolvedValue("sent");
  });
  afterEach(() => vi.useRealTimers());

  it("recognises a 402 and an out-of-credits body, and nothing else", () => {
    expect(isGatewayCreditsStop(credits)).toBe(true);
    expect(isGatewayCreditsStop({ status: 429, category: "quota", provider: "lovable", detail: '{"code":"insufficient_quota"}' })).toBe(true);
    expect(isGatewayCreditsStop({ status: 429, category: "rate_limited", provider: "lovable", detail: "slow down" })).toBe(false);
    expect(isGatewayCreditsStop({ status: 503, category: "provider_unavailable", provider: "lovable", detail: null })).toBe(false);
    expect(isGatewayCreditsStop({ ...credits, provider: "groq" })).toBe(false);
  });

  it("sends one email-only founder alert for a burst of 402s", async () => {
    for (let i = 0; i < 25; i += 1) noteGatewayCreditsStop(credits);
    await flush();
    expect(sendFounderAlert).toHaveBeenCalledTimes(1);
    const alert = (sendFounderAlert.mock.calls[0] as unknown as [unknown, { kind: string; marker: string; organizationId: null }])[1];
    expect(alert.kind).toBe("ai_gateway_credits");
    expect(alert.marker).toBe(gatewayCreditsMarker());
    expect(alert.organizationId).toBeNull();
  });

  it("a 429 or 5xx sends nothing", async () => {
    noteGatewayCreditsStop({ status: 429, category: "rate_limited", provider: "lovable", detail: null });
    noteGatewayCreditsStop({ status: 503, category: "provider_unavailable", provider: "lovable", detail: null });
    await flush();
    expect(sendFounderAlert).not.toHaveBeenCalled();
  });

  it("uses one marker per six-hour window, so workers share the dedupe", () => {
    const base = Date.UTC(2026, 10, 1, 6, 0, 0);
    expect(gatewayCreditsMarker(base)).toBe(gatewayCreditsMarker(base + 5 * 3_600_000));
    expect(gatewayCreditsMarker(base)).not.toBe(gatewayCreditsMarker(base + 6 * 3_600_000));
  });

  it("alerts again in the next window", async () => {
    const now = Date.UTC(2026, 10, 1, 6, 0, 0);
    noteGatewayCreditsStop(credits, now);
    noteGatewayCreditsStop(credits, now + 6 * 3_600_000);
    await flush();
    expect(sendFounderAlert).toHaveBeenCalledTimes(2);
  });

  it("a failed send is retried by the next refusal instead of being suppressed", async () => {
    sendFounderAlert.mockResolvedValueOnce("failed" as never);
    noteGatewayCreditsStop(credits);
    await flush();
    noteGatewayCreditsStop(credits);
    await flush();
    expect(sendFounderAlert).toHaveBeenCalledTimes(2);
  });
});
