import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";
import { accountRestFor, FREE_ATTEMPT_CAP_MS } from "./router.server";
import { HALL_OF_FAME_MEMBER_MS_DEFAULT, HALL_OF_FAME_PER_PROVIDER_CONCURRENCY, hallOfFameProviderBusy } from "./hall-of-fame.server";
import { createOpenAiCompatibleAdapter } from "./providers/openai-compatible";

describe("free team failure fixes", () => {
  beforeEach(() => isolateProviderEnvironment());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rests a provider after one spent-allowance answer until the next UTC day", () => {
    const now = Date.UTC(2026, 9, 21, 22, 0, 0);
    expect(accountRestFor("quota", now)).toEqual({ failureThreshold: 1, cooldownSeconds: 7200 });
    // Just before midnight still rests at least 15 minutes.
    expect(accountRestFor("quota", Date.UTC(2026, 9, 21, 23, 59, 0)).cooldownSeconds).toBe(900);
  });

  it("rests a provider with a rejected key for 6 hours", () => {
    expect(accountRestFor("unauthorized")).toEqual({ failureThreshold: 1, cooldownSeconds: 21600 });
  });

  it("keeps the normal circuit for ordinary failures", () => {
    expect(accountRestFor("timeout")).toEqual({});
    expect(accountRestFor("rate_limited")).toEqual({});
  });

  it("gives review members 45 seconds and caps one free attempt at 60", () => {
    expect(HALL_OF_FAME_MEMBER_MS_DEFAULT).toBe(45_000);
    expect(FREE_ATTEMPT_CAP_MS).toBe(60_000);
  });

  it("allows 2 review calls per free service at once", () => {
    expect(HALL_OF_FAME_PER_PROVIDER_CONCURRENCY).toBe(2);
    expect(hallOfFameProviderBusy("groq")).toBe(false);
  });

  it("retries with a bigger budget when a thinking model used it all up", async () => {
    const bodies: { max_tokens?: number }[] = [];
    const replies = [
      { choices: [{ message: { content: "", reasoning: "thinking..." }, finish_reason: "length" }] },
      { choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] },
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(replies[bodies.length - 1]), { status: 200 });
    }));
    const adapter = createOpenAiCompatibleAdapter({ name: "groq", baseUrl: () => "https://x.example/v1" });
    const result = await adapter.chat({ apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }], maxOutputTokens: 900, json: true } as never);
    expect(result.text).toBe('{"ok":true}');
    expect(bodies[1]?.max_tokens).toBe(4096);
  });

  it("uses JSON found only in the reasoning field for JSON calls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: null, reasoning_content: 'so: {"a":1}' }, finish_reason: "stop" }],
    }), { status: 200 })));
    const adapter = createOpenAiCompatibleAdapter({ name: "groq", baseUrl: () => "https://x.example/v1" });
    const result = await adapter.chat({ apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }], json: true } as never);
    expect(result.text).toBe('{"a":1}');
  });
});
