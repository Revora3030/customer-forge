/**
 * The free model pool must work as one team: a single model that is retired,
 * picky about parameters, slow, or chatty around its JSON must never stop the
 * request while other models can still answer.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { extractJsonObject } from "@/lib/ai/router.server";
import { providerHttpError } from "@/lib/ai/providers/shared";
import {
  createOpenAiCompatibleAdapter,
  stripReasoning,
} from "@/lib/ai/providers/openai-compatible";
import { isFreeEligibleModel } from "@/lib/ai/free";

const router = readFileSync("src/lib/ai/router.server.ts", "utf8");

describe("JSON recovery from free-model answers", () => {
  it("reads a fenced block surrounded by prose", () => {
    expect(extractJsonObject('Sure! Here it is:\n```json\n{"a":1}\n```\nHope that helps.')).toEqual(
      { a: 1 },
    );
  });
  it("reads the first balanced object inside prose, ignoring braces in strings", () => {
    expect(extractJsonObject('Answer: {"t":"a } b","n":{"x":2}} done')).toEqual({
      t: "a } b",
      n: { x: 2 },
    });
  });
  it("drops thinking blocks and tolerates trailing commas", () => {
    expect(extractJsonObject('<think>plan {"no":1}</think>{"ok":true,}')).toEqual({ ok: true });
  });
  it("unwraps a one-object list and rejects non-objects", () => {
    expect(extractJsonObject('[{"k":"v"}]')).toEqual({ k: "v" });
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("[1,2]")).toBeNull();
  });
});

describe("reasoning text never reaches the site", () => {
  it("strips closed, dangling and orphaned thinking tags", () => {
    expect(stripReasoning("<think>secret</think>Hello")).toBe("Hello");
    expect(stripReasoning("half thought</think> Final")).toBe("Final");
    expect(stripReasoning("<think>never finished")).toBe("");
  });
});

describe("provider error mapping", () => {
  it("treats a retired model (404) as that model's failure, not an outage or bad request", async () => {
    const error = await providerHttpError(
      "groq",
      new Response('{"error":"model not found"}', { status: 404 }),
    );
    expect(error.category).toBe("bad_response");
    expect(error.retryable).toBe(false);
  });
  it("treats a 400 'model does not exist' the same way", async () => {
    const error = await providerHttpError(
      "mistral",
      new Response("The model `x` does not exist", { status: 400 }),
    );
    expect(error.category).toBe("bad_response");
  });
  it("still reports rate limits as rate limits", async () => {
    const error = await providerHttpError("groq", new Response("model busy", { status: 429 }));
    expect(error.category).toBe("rate_limited");
  });
});

describe("JSON mode fallback", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("retries without response_format when a model refuses it", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        if (body["response_format"])
          return new Response("response_format is not supported", { status: 400 });
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }), {
          status: 200,
        });
      }),
    );
    const adapter = createOpenAiCompatibleAdapter({
      name: "groq",
      baseUrl: () => "https://x.test/v1",
    });
    const result = await adapter.chat({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      json: true,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    });
    expect(result.text).toBe('{"ok":1}');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!["response_format"]).toBeUndefined();
  });
});

describe("free-eligibility keeps non-writers out of the team", () => {
  it("rejects embedders on Cohere and Hugging Face", () => {
    expect(isFreeEligibleModel("cohere", "embed-v4.0")).toBe(false);
    expect(isFreeEligibleModel("cohere", "command-a-plus-05-2026")).toBe(true);
    expect(isFreeEligibleModel("huggingface", "BAAI/bge-large-embed")).toBe(false);
    expect(isFreeEligibleModel("huggingface", "meta-llama/Llama-3.3-70B-Instruct")).toBe(true);
  });
  it("points Cohere at its OpenAI-compatible endpoint", () => {
    expect(readFileSync("src/lib/ai/providers/cohere.ts", "utf8")).toContain(
      "api.cohere.ai/compatibility/v1",
    );
  });
});

describe("router teamwork rules", () => {
  it("moves to the next free model on a refused request instead of stopping", () => {
    expect(router).toMatch(/if \(!candidate\.free\) throw error;/);
    expect(router).toMatch(/invalidBy\.size >= 3/);
  });
  it("skips every model of a provider whose key or quota was refused", () => {
    expect(router).toMatch(/deadProviders\.add\(config\.name\)/);
  });
  it("only benches a whole provider for provider-wide trouble", () => {
    expect(router).toMatch(/candidate\.free && providerWideFailure\(error\)/);
  });
  it("bounds the whole failover walk with a deadline", () => {
    expect(router).toMatch(/AI_CHAIN_DEADLINE_MS/);
  });
  it("waits briefly for a free slot instead of refusing team members", () => {
    expect(router).toMatch(/acquireWaiting\(/);
  });
});
