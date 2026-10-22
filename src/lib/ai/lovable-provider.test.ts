/**
 * The Lovable AI Gateway paid lane: registered only when LOVABLE_API_KEY is
 * present, ordered behind Revora's own keys, excluded from free-only scopes,
 * and speaking the gateway's chat-completions wire format with the right
 * per-model token/reasoning rules. All HTTP is stubbed; ambient deployment
 * credentials must never trigger a real call (provider-test-environment).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import { providerChain, providerConfig } from "@/lib/ai/config";
import { lovableAdapter } from "@/lib/ai/providers/lovable";

const saved = { ...process.env };

beforeEach(() => {
  isolateProviderEnvironment();
  vi.resetModules();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

type CapturedCall = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function stubGateway(status = 200, payload?: unknown) {
  const calls: CapturedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>))
        headers[key.toLowerCase()] = value;
      calls.push({
        url: String(input),
        headers,
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      if (status !== 200) return new Response("gateway failure", { status });
      return new Response(
        JSON.stringify(
          payload ?? {
            choices: [{ message: { content: "lovable answered" } }],
            usage: { prompt_tokens: 7, completion_tokens: 4 },
          },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

describe("lovable provider registration", () => {
  it("is absent from the paid chain without a key", () => {
    expect(providerConfig("lovable")).toBeNull();
    expect(providerChain().map((entry) => entry.name)).not.toContain("lovable");
  });

  it("joins the paid chain behind Revora's own keys when its key is present", () => {
    process.env["GOOGLE_AI_API_KEY"] = "test-google";
    process.env["OPENAI_API_KEY"] = "test-openai";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    expect(providerChain().map((entry) => entry.name)).toEqual(["openai", "google", "lovable"]);
  });

  it("serves a model roster for every role from the verified gateway catalogue", () => {
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    const config = providerConfig("lovable");
    expect(config).not.toBeNull();
    for (const roster of Object.values(config!.models)) {
      for (const model of roster.split(",").map((id) => id.trim())) {
        expect(model).toMatch(/^(openai|google|anthropic)\//);
      }
    }
    // Claude is part of the team: the adapter speaks the native /v1/messages
    // endpoint for anthropic/* ids.
    expect(
      Object.values(config!.models).some((roster) => roster.includes("anthropic/claude-")),
    ).toBe(true);
  });
});

describe("lovable anthropic messages wire format", () => {
  it("calls /v1/messages with a top-level system prompt and Anthropic usage", async () => {
    const calls = stubGateway(200, {
      content: [{ type: "text", text: "claude answered" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 11, output_tokens: 6 },
    });
    const result = await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "anthropic/claude-sonnet-5",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hello" },
      ],
      json: false,
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    });
    expect(result.text).toBe("claude answered");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 6 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/messages");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer test-lovable");
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]!.body["model"]).toBe("anthropic/claude-sonnet-5");
    expect(calls[0]!.body["system"]).toBe("be terse");
    expect(calls[0]!.body["max_tokens"]).toBe(256);
    expect(calls[0]!.body["messages"]).toEqual([{ role: "user", content: "hello" }]);
  });

  it("converts image parts to base64 Messages blocks", async () => {
    const calls = stubGateway(200, {
      content: [{ type: "text", text: "seen" }],
      usage: { input_tokens: 3, output_tokens: 1 },
    });
    await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "anthropic/claude-haiku-4-5",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", dataUrl: "data:image/png;base64,QUJD", mimeType: "image/png" },
          ],
        },
      ],
      json: false,
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    });
    expect(calls[0]!.body["messages"]).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
        ],
      },
    ]);
  });

  it("treats a refusal stop_reason as a failed answer so the router fails over", async () => {
    stubGateway(200, { content: [], stop_reason: "refusal" });
    await expect(
      lovableAdapter.chat({
        apiKey: "test-lovable",
        model: "anthropic/claude-opus-5-5",
        messages: [{ role: "user", content: "hello" }],
        json: false,
        maxOutputTokens: 64,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ category: "bad_response", provider: "lovable" });
  });

  it("streams anthropic answers as chat-completions SSE", async () => {
    stubGateway(200, {
      content: [{ type: "text", text: "streamed claude" }],
      usage: { input_tokens: 2, output_tokens: 2 },
    });
    const stream = await lovableAdapter.stream({
      apiKey: "test-lovable",
      model: "anthropic/claude-sonnet-5",
      messages: [{ role: "user", content: "hello" }],
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    });
    const text = await new Response(stream).text();
    expect(text).toContain("streamed claude");
    expect(text).toContain("data: [DONE]");
  });
});

describe("lovable adapter wire format", () => {
  it("calls the gateway chat-completions endpoint with both key headers", async () => {
    const calls = stubGateway();
    const result = await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "google/gemini-3.8-flash",
      messages: [{ role: "user", content: "hello" }],
      json: false,
      maxOutputTokens: 256,
      temperature: 0.4,
      signal: new AbortController().signal,
    });
    expect(result.text).toBe("lovable answered");
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 4 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer test-lovable");
    expect(calls[0]!.headers["lovable-api-key"]).toBe("test-lovable");
    expect(calls[0]!.headers["x-lovable-aig-sdk"]).toBe("fetch");
    // Non-reasoning Gemini models take max_tokens and the caller's temperature.
    expect(calls[0]!.body["model"]).toBe("google/gemini-3.8-flash");
    expect(calls[0]!.body["max_tokens"]).toBe(256);
    expect(calls[0]!.body["temperature"]).toBe(0.4);
    expect(calls[0]!.body["max_completion_tokens"]).toBeUndefined();
  });

  it("sends GPT-6 models max_completion_tokens and a reasoning effort, never a temperature", async () => {
    const calls = stubGateway();
    await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "openai/gpt-6-sol",
      messages: [{ role: "user", content: "hello" }],
      json: false,
      maxOutputTokens: 512,
      temperature: 0.9,
      signal: new AbortController().signal,
    });
    expect(calls[0]!.body["max_completion_tokens"]).toBe(512);
    expect(calls[0]!.body["reasoning_effort"]).toBe("low");
    expect(calls[0]!.body["max_tokens"]).toBeUndefined();
    expect(calls[0]!.body["temperature"]).toBeUndefined();
  });

  it("treats an empty answer as a failure so the router fails over", async () => {
    stubGateway(200, { choices: [{ message: { content: "" } }] });
    await expect(
      lovableAdapter.chat({
        apiKey: "test-lovable",
        model: "openai/gpt-6-astra",
        messages: [{ role: "user", content: "hello" }],
        json: false,
        maxOutputTokens: 128,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ category: "bad_response", provider: "lovable" });
  });
});

describe("lovable through the router", () => {
  it("answers through the gateway when it is the only keyed provider", async () => {
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    const calls = stubGateway();

    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { task: "test.lovable", organizationId: null, userId: null },
      { messages: [{ role: "user", content: "hello" }] },
    );

    expect(result.text).toBe("lovable answered");
    expect(result.provider).toBe("lovable");
    expect(calls.some((call) => call.url.includes("ai.gateway.lovable.dev"))).toBe(true);
  }, 30_000);

  it("never reaches the gateway inside a free-only spending scope", async () => {
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    const calls = stubGateway();

    const { generateText } = await import("@/lib/ai/router.server");
    const { withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
    await expect(
      withAiSpendScope({ freeOnly: true, reason: "demo_workspace" }, () =>
        generateText(
          { task: "test.lovable", organizationId: null, userId: null },
          { messages: [{ role: "user", content: "hello" }] },
        ),
      ),
    ).rejects.toMatchObject({ name: "RevoraAiError" });
    expect(calls.some((call) => call.url.includes("ai.gateway.lovable.dev"))).toBe(false);
  }, 30_000);
});
