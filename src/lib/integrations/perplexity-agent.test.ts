import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevoraAiError } from "@/lib/ai/errors";

const searchWeb = vi.fn();
const generateText = vi.fn();

vi.mock("./research.server", () => ({ searchWeb: (...args: unknown[]) => searchWeb(...args) }));
vi.mock("@/lib/ai/router.server", () => ({ generateText: (...args: unknown[]) => generateText(...args) }));

const { runPerplexityAgent, RESEARCH_PRESETS } = await import("./perplexity-agent.server");

const source = { fetchedAt: "2026-11-04T00:00:00.000Z", provider: "perplexity", trust: "research" as const };
const RESULTS = [
  { title: "Example", url: "https://example.com/a", snippet: "Revora builds sites.", date: null, source: { ...source, url: "https://example.com/a" } },
  { title: "", url: "https://example.com/b", snippet: "Second.", date: "2026-10-01", source: { ...source, url: "https://example.com/b" } },
];

const textResult = (text: string) => ({
  text,
  provider: "lovable",
  model: "google/gemini-3-flash",
  usage: { inputTokens: 10, outputTokens: 10 },
  fallbackUsed: false,
  requestId: "req_test_1",
});

describe("research agent on Lovable paths", () => {
  beforeEach(() => {
    searchWeb.mockReset();
    generateText.mockReset();
    vi.unstubAllGlobals();
  });

  it("reports not_configured when the Lovable connector search isn't connected, without calling the model", async () => {
    searchWeb.mockResolvedValue({ ok: false, reason: "not_configured", detail: "Web search isn't connected." });
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("not_configured");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("grounds the answer in connector search results and writes it through the router with explicit timeouts", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    searchWeb.mockResolvedValue({ ok: true, results: RESULTS });
    generateText.mockResolvedValue(textResult("Revora builds sites [1]. Also see [2] and [1] and [9]."));
    const outcome = await runPerplexityAgent({ input: "What is Revora?", preset: "medium" });

    expect(searchWeb).toHaveBeenCalledWith("What is Revora?", RESEARCH_PRESETS.medium.results);
    expect(generateText).toHaveBeenCalledTimes(1);
    const [caller, request] = generateText.mock.calls[0]!;
    expect(caller).toEqual({ task: "research.ask" });
    expect(request.timeoutMs).toBe(RESEARCH_PRESETS.medium.timeoutMs);
    expect(request.chainDeadlineMs).toBe(RESEARCH_PRESETS.medium.chainDeadlineMs);
    expect(request.maxOutputTokens).toBe(RESEARCH_PRESETS.medium.tokens);
    expect(JSON.stringify(request.messages)).toContain("[1] Example\\nhttps://example.com/a");
    // Nothing in this module talks to the network itself.
    expect(fetchSpy).not.toHaveBeenCalled();

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.id).toBe("req_test_1");
      expect(outcome.model).toBe("lovable/google/gemini-3-flash");
      expect(outcome.text).toContain("Revora builds sites");
      expect(outcome.citations).toEqual(["https://example.com/a", "https://example.com/b"]);
      expect(outcome.searchResults).toEqual([
        { title: "Example", url: "https://example.com/a" },
        { title: null, url: "https://example.com/b" },
      ]);
    }
  });

  it("every preset sets a bounded per-call timeout and chain deadline", () => {
    for (const preset of Object.values(RESEARCH_PRESETS)) {
      expect(preset.timeoutMs).toBeGreaterThan(0);
      expect(preset.timeoutMs).toBeLessThanOrEqual(60_000);
      expect(preset.chainDeadlineMs).toBeGreaterThanOrEqual(preset.timeoutMs);
      expect(preset.chainDeadlineMs).toBeLessThanOrEqual(90_000);
    }
  });

  it("passes caller instructions and maxOutputTokens through", async () => {
    searchWeb.mockResolvedValue({ ok: true, results: RESULTS });
    generateText.mockResolvedValue(textResult("ok"));
    await runPerplexityAgent({ input: "q", instructions: "Answer in one line.", maxOutputTokens: 64 });
    const [, request] = generateText.mock.calls[0]!;
    expect(request.maxOutputTokens).toBe(64);
    expect(request.messages[0].content).toContain("Answer in one line.");
  });

  it.each([
    [new RevoraAiError(500, "x", { category: "quota", provider: "lovable" }), "quota_exhausted"],
    [new RevoraAiError(500, "x", { category: "not_configured", provider: "lovable" }), "not_configured"],
    [new RevoraAiError(500, "x", { category: "timeout", provider: "lovable" }), "timeout"],
    [new RevoraAiError(500, "x", { category: "bad_response", provider: "lovable" }), "provider_error"],
    [new Error("boom"), "provider_error"],
  ])("maps router failures to stable reasons (%#)", async (error, reason) => {
    searchWeb.mockResolvedValue({ ok: true, results: RESULTS });
    generateText.mockRejectedValue(error);
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe(reason);
  });

  it("keeps Retry-After on router rate limits", async () => {
    searchWeb.mockResolvedValue({ ok: true, results: RESULTS });
    generateText.mockRejectedValue(
      new RevoraAiError(429, "slow down", { category: "rate_limited", provider: "lovable", retryAfterSeconds: 17 }),
    );
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("rate_limited");
      expect(outcome.retryAfterSeconds).toBe(17);
    }
  });

  it.each([
    [{ ok: false, reason: "unavailable", detail: "perplexity: The operation was aborted due to timeout" }, "timeout"],
    [{ ok: false, reason: "unavailable", detail: "perplexity: Lovable Perplexity search 429" }, "rate_limited"],
    [{ ok: false, reason: "unavailable", detail: "perplexity: 500" }, "provider_error"],
  ])("maps search failures without calling the model (%#)", async (failure, reason) => {
    searchWeb.mockResolvedValue(failure);
    const outcome = await runPerplexityAgent({ input: "hi" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe(reason);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("never calls a third-party AI host or the Perplexity SDK directly", () => {
    const file = readFileSync(join(process.cwd(), "src/lib/integrations/perplexity-agent.server.ts"), "utf8");
    expect(file).not.toMatch(/api\.perplexity\.ai|@perplexity-ai\/|PERPLEXITY_API_KEY_1/);
    expect(file).not.toMatch(/\bfetch\(/);
  });
});
