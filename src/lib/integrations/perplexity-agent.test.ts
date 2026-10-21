import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPerplexityAgent } from "./perplexity-agent.server";

const SUCCESS_BODY = {
  id: "resp_test_1",
  object: "response",
  model: "openai/gpt-5.6-sol",
  output: [
    {
      type: "search_results",
      results: [{ id: 1, title: "Example", url: "https://example.com/a", snippet: "…" }],
    },
    {
      type: "message",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: "A grounded answer.",
          annotations: [{ type: "url_citation", url: "https://example.com/a" }],
        },
      ],
    },
  ],
};

const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
};

describe("perplexity agent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env["PERPLEXITY_API_KEY_1"];
  });

  it("reports not_configured without the owner's key", async () => {
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("not_configured");
  });

  it("posts to the Agent API with the owner's key and maps the response", async () => {
    process.env["PERPLEXITY_API_KEY_1"] = "pplx-test";
    const calls = stubFetch(() => Response.json(SUCCESS_BODY, { status: 200 }));
    const outcome = await runPerplexityAgent({ input: "What is Revora?", preset: "fast" });
    expect(calls).toHaveLength(1);
    // The SDK posts to /v1/responses, the documented OpenAI-compat alias of /v1/agent.
    expect(calls[0]!.url).toMatch(/^https:\/\/api\.perplexity\.ai\/v1\/(agent|responses)/);
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer pplx-test");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.text).toContain("grounded answer");
      expect(outcome.citations).toEqual(["https://example.com/a"]);
      expect(outcome.searchResults).toEqual([{ title: "Example", url: "https://example.com/a" }]);
    }
  });

  it("classifies 401 insufficient_quota as exhausted credits", async () => {
    process.env["PERPLEXITY_API_KEY_1"] = "pplx-test";
    stubFetch(() =>
      Response.json(
        { error: { message: "You exceeded your current quota: insufficient_quota" } },
        { status: 401 },
      ),
    );
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("quota_exhausted");
      expect(outcome.detail).toContain("console.perplexity.ai");
    }
  });

  it("classifies 429 with Retry-After as rate limited", async () => {
    process.env["PERPLEXITY_API_KEY_1"] = "pplx-test";
    stubFetch(() =>
      Response.json({ error: { message: "slow down" } }, { status: 429, headers: { "retry-after": "17" } }),
    );
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("rate_limited");
      expect(outcome.retryAfterSeconds).toBe(17);
    }
  });
});
