import { afterEach, describe, expect, it } from "vitest";
import {
  BILLING_EXHAUSTED_TEXT,
  backoffMs,
  degradedProviders,
  demoteDegradedPaid,
  noteProviderFailure,
  noteProviderSuccess,
  providerDegraded,
  resetProviderBackoff,
} from "./provider-backoff";
import { providerHttpError } from "./providers/shared";

afterEach(() => resetProviderBackoff());

const paid = (name: string) => ({ free: null, config: { name } });
const free = (name: string) => ({ free: name, config: { name } });

describe("paid provider backoff (free-first auto-switch)", () => {
  it("backs off exponentially and caps at 30 minutes", () => {
    expect(backoffMs(1)).toBe(120_000);
    expect(backoffMs(2)).toBe(240_000);
    expect(backoffMs(10)).toBe(30 * 60_000);
  });

  it("only billing/limit failures degrade a provider", () => {
    noteProviderFailure("openai", "invalid_request", 0);
    noteProviderFailure("openai", "bad_response", 0);
    expect(providerDegraded("openai", 1)).toBe(false);
    noteProviderFailure("openai", "quota", 0);
    expect(providerDegraded("openai", 1)).toBe(true);
    expect(providerDegraded("openai", 120_001)).toBe(false);
  });

  it("moves a degraded paid provider behind the free pool, keeping it as last resort", () => {
    noteProviderFailure("openai", "quota", 0);
    const order = demoteDegradedPaid([paid("openai"), paid("google"), free("groq"), free("cloudflare")], 10);
    expect(order.map((entry) => entry.config.name)).toEqual(["google", "groq", "cloudflare", "openai"]);
  });

  it("restores paid-first order after a funded success", () => {
    noteProviderFailure("openai", "quota", 0);
    noteProviderSuccess("openai");
    const order = demoteDegradedPaid([paid("openai"), free("groq")], 10);
    expect(order[0]!.config.name).toBe("openai");
    expect(degradedProviders(10)).toEqual([]);
  });

  it("caps a plain rate-limit cooldown at five minutes", () => {
    for (let i = 0; i < 6; i += 1) noteProviderFailure("google", "rate_limited", 0);
    expect(providerDegraded("google", 5 * 60_000 - 1)).toBe(true);
    expect(providerDegraded("google", 5 * 60_000 + 1)).toBe(false);
  });

  it("recognises out-of-credit bodies", () => {
    expect(BILLING_EXHAUSTED_TEXT.test('{"error":{"code":"insufficient_quota"}}')).toBe(true);
    expect(BILLING_EXHAUSTED_TEXT.test("Your credit balance is too low")).toBe(true);
    expect(BILLING_EXHAUSTED_TEXT.test("model overloaded")).toBe(false);
  });

  it("classifies a 429 insufficient_quota as quota, not a busy moment", async () => {
    const error = await providerHttpError(
      "openai",
      new Response('{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}', { status: 429 }),
    );
    expect(error.category).toBe("quota");
    const busy = await providerHttpError("openai", new Response("slow down", { status: 429 }));
    expect(busy.category).toBe("rate_limited");
  });
});
