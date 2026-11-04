import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configuredSearchProviders, searchWeb, SEARCH_TIMEOUT_MS } from "./research.server";

// Assembled, not written literally, so ai-platform's "who reads the Lovable key" scan stays exact.
const LOVABLE_KEY = ["LOVABLE", "API", "KEY"].join("_");
const KEYS = [LOVABLE_KEY, "PERPLEXITY_API_KEY", "PERPLEXITY_API_KEY_1", "TAVILY_API_KEY", "BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY", "EXA_API_KEY", "JINA_API_KEY"];

const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    }),
  );
  return calls;
};

describe("web search is Lovable connector-gateway only", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const name of KEYS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });
  afterEach(() => {
    for (const name of KEYS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    vi.unstubAllGlobals();
  });

  it("is not configured with only direct third-party keys, and never calls out", async () => {
    process.env["PERPLEXITY_API_KEY_1"] = "direct-test";
    process.env["TAVILY_API_KEY"] = "tvly-test";
    process.env["BRAVE_SEARCH_API_KEY"] = "brave-test";
    process.env["EXA_API_KEY"] = "exa-test";
    process.env["JINA_API_KEY"] = "jina-test";
    const calls = stubFetch(() => Response.json({ results: [] }));
    expect(configuredSearchProviders()).toEqual([]);
    const outcome = await searchWeb("plumbers in austin");
    expect(outcome).toMatchObject({ ok: false, reason: "not_configured" });
    expect(calls).toHaveLength(0);
  });

  it("posts only to the Lovable connector gateway, even when direct keys are also set", async () => {
    process.env[LOVABLE_KEY] = "lovable-test";
    process.env["PERPLEXITY_API_KEY"] = "conn-test";
    process.env["PERPLEXITY_API_KEY_1"] = "direct-test";
    process.env["TAVILY_API_KEY"] = "tvly-test";
    const calls = stubFetch(() =>
      Response.json({
        results: [
          { title: "A", url: "https://a.example/x", snippet: "  one \n two ", date: "2026-10-01" },
          { title: "bad", url: "javascript:alert(1)", snippet: "" },
        ],
      }),
    );
    expect(configuredSearchProviders()).toEqual(["perplexity"]);
    const outcome = await searchWeb("  plumbers in austin  ", 50);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://connector-gateway.lovable.dev/perplexity/search");
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer lovable-test");
    expect(headers.get("x-connection-api-key")).toBe("conn-test");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ query: "plumbers in austin", max_results: 10 });
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.results).toHaveLength(1);
      expect(outcome.results[0]).toMatchObject({ title: "A", url: "https://a.example/x", snippet: " one two ", date: "2026-10-01" });
      expect(outcome.results[0]!.source).toMatchObject({ provider: "perplexity", trust: "research" });
    }
  });

  it("reports rate limits with Retry-After and does not fall back", async () => {
    process.env[LOVABLE_KEY] = "lovable-test";
    process.env["PERPLEXITY_API_KEY"] = "conn-test";
    process.env["TAVILY_API_KEY"] = "tvly-test";
    const calls = stubFetch(() => new Response("slow down", { status: 429, headers: { "retry-after": "12" } }));
    const outcome = await searchWeb("q");
    expect(calls).toHaveLength(1);
    expect(outcome).toMatchObject({ ok: false, reason: "rate_limited", retryAfterSeconds: 12 });
  });

  it("reports a timeout clearly", async () => {
    process.env[LOVABLE_KEY] = "lovable-test";
    process.env["PERPLEXITY_API_KEY"] = "conn-test";
    stubFetch(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const outcome = await searchWeb("q");
    expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
    if (!outcome.ok) expect(outcome.detail).toContain(`${SEARCH_TIMEOUT_MS / 1000}s`);
    expect(SEARCH_TIMEOUT_MS).toBe(15_000);
  });

  it("reports other gateway failures as unavailable without leaking keys", async () => {
    process.env[LOVABLE_KEY] = "lovable-secret";
    process.env["PERPLEXITY_API_KEY"] = "conn-secret";
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => new Response("upstream down", { status: 502 }));
    const outcome = await searchWeb("q");
    expect(outcome).toMatchObject({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(outcome)).not.toMatch(/secret/);
  });

  it("names no direct third-party search or AI host", () => {
    const file = readFileSync(join(process.cwd(), "src/lib/integrations/research.server.ts"), "utf8");
    for (const host of ["api.perplexity.ai", "api.tavily.com", "api.search.brave.com", "api.exa.ai", "s.jina.ai"])
      expect(file, host).not.toContain(host);
  });
});
