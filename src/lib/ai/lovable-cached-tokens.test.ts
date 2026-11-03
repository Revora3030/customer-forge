/**
 * The gateway reports OpenAI prefix-cache hits as
 * usage.prompt_tokens_details.cached_tokens; the adapter must keep them so
 * the Luna ledger (cached_input_tokens) is not silently stuck at 0.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readChatStream, usageOf, logPromptCache } from "@/lib/ai/providers/lovable";

afterEach(() => vi.restoreAllMocks());

describe("cached-token logging", () => {
  it("reads usage.prompt_tokens_details.cached_tokens", () => {
    expect(usageOf({ usage: { prompt_tokens: 3000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 2048 } } })).toEqual({
      inputTokens: 3000,
      outputTokens: 50,
      cachedInputTokens: 2048,
    });
    expect(usageOf({ usage: { prompt_tokens: 10, completion_tokens: 2 } })).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  it("reads cached tokens from the final streamed usage chunk", async () => {
    const frames = [
      { choices: [{ delta: { content: "{}" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 2200, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 1920 } } },
    ];
    const body = new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") + "data: [DONE]\n\n").body!;
    const out = await readChatStream(body);
    expect(out.usage.cachedInputTokens).toBe(1920);
  });

  it("logs one structured line, with null (unknown) when the gateway did not report it", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logPromptCache("openai/gpt-6.1-sol", { inputTokens: 2200, outputTokens: 3, cachedInputTokens: 1920 });
    logPromptCache("openai/gpt-6.1-sol", { inputTokens: 2200, outputTokens: 3 });
    logPromptCache("openai/gpt-6.1-sol", { inputTokens: null, outputTokens: null });
    expect(info).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(info.mock.calls[0]![0]))).toEqual({ event: "ai.prompt_cache", provider: "lovable", model: "openai/gpt-6.1-sol", prompt_tokens: 2200, cached_tokens: 1920 });
    expect(JSON.parse(String(info.mock.calls[1]![0])).cached_tokens).toBeNull();
  });
});
