import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FREE_PROVIDERS,
  freeModelFor,
  freeProviderCredentials,
  freeProviderOrder,
  isFreeEligibleModel,
  noteZeroPriceModels,
  resetZeroPriceModels,
} from "@/lib/ai/free";
import { parseActions } from "@/lib/jarvis-actions";

const KEYS = ["SAMBANOVA_API_KEY", "SAMBANOVA_FREE_TIER", "TOGETHER_API_KEY", "SILICONFLOW_API_KEY", "POLLINATIONS_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_FREE_TIER", "GOOGLE_AI_FREE_API_KEY", "GOOGLE_AI_API_KEY"];

afterEach(() => {
  for (const name of KEYS) delete process.env[name];
  resetZeroPriceModels();
  vi.restoreAllMocks();
});

describe("new free providers", () => {
  it("are registered in the pool and the default order", () => {
    for (const provider of ["sambanova", "together", "siliconflow", "pollinations"] as const) {
      expect(FREE_PROVIDERS).toContain(provider);
      expect(freeProviderOrder()).toContain(provider);
    }
  });

  it("only use their own keys, and SambaNova can be switched off", () => {
    expect(freeProviderCredentials("sambanova")).toBeNull();
    process.env["SAMBANOVA_API_KEY"] = "sn";
    process.env["TOGETHER_API_KEY"] = "tg";
    process.env["SILICONFLOW_API_KEY"] = "sf";
    process.env["POLLINATIONS_API_KEY"] = "sk_pl";
    expect(freeProviderCredentials("sambanova")?.apiKey).toBe("sn");
    expect(freeProviderCredentials("together")?.apiKey).toBe("tg");
    expect(freeProviderCredentials("siliconflow")?.apiKey).toBe("sf");
    expect(freeProviderCredentials("pollinations")?.apiKey).toBe("sk_pl");
    process.env["SAMBANOVA_FREE_TIER"] = "false";
    expect(freeProviderCredentials("sambanova")).toBeNull();
  });

  it("never treat a billed Together model as free", () => {
    expect(isFreeEligibleModel("together", "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free")).toBe(true);
    expect(isFreeEligibleModel("together", "meta-llama/Llama-3.3-70B-Instruct-Turbo")).toBe(false);
    noteZeroPriceModels("together", ["acme/zero-price-chat"]);
    expect(isFreeEligibleModel("together", "acme/zero-price-chat")).toBe(true);
  });

  it("keep SiliconFlow to its free allowlist", () => {
    expect(isFreeEligibleModel("siliconflow", "Qwen/Qwen3-8B")).toBe(true);
    expect(isFreeEligibleModel("siliconflow", "deepseek-ai/DeepSeek-V3")).toBe(false);
    expect(freeModelFor("siliconflow", "coding")).toBe("Qwen/Qwen2.5-Coder-7B-Instruct");
  });

  it("keep Pollinations to basic or explicitly free models", () => {
    expect(isFreeEligibleModel("pollinations", "openai")).toBe(true);
    expect(isFreeEligibleModel("pollinations", "premium-model")).toBe(false);
    noteZeroPriceModels("pollinations", ["premium-model"]);
    expect(isFreeEligibleModel("pollinations", "premium-model")).toBe(true);
  });

  it("reject non-chat models on SambaNova", () => {
    expect(isFreeEligibleModel("sambanova", "DeepSeek-V3.1")).toBe(true);
    expect(isFreeEligibleModel("sambanova", "E5-Mistral-7B-Instruct")).toBe(false);
    expect(isFreeEligibleModel("sambanova", "Whisper-Large-v3")).toBe(false);
  });

  it("clamps SambaNova temperature and points each adapter at its host", () => {
    expect(readFileSync("src/lib/ai/providers/sambanova.ts", "utf8")).toContain("maxTemperature: 1");
    expect(readFileSync("src/lib/ai/providers/together.ts", "utf8")).toContain("https://api.together.xyz/v1");
    expect(readFileSync("src/lib/ai/providers/pollinations.ts", "utf8")).toContain("https://gen.pollinations.ai/v1");
  });

  it("uses GEMINI_API_KEY only behind the free-tier opt-in", () => {
    process.env["GEMINI_API_KEY"] = "gm";
    expect(freeProviderCredentials("google")).toBeNull();
    process.env["GOOGLE_AI_FREE_TIER"] = "true";
    expect(freeProviderCredentials("google")?.apiKey).toBe("gm");
  });
});

describe("web search", () => {
  it("falls through to the next provider with a key", async () => {
    process.env["TAVILY_API_KEY"] = "tv";
    process.env["JINA_API_KEY"] = "jn";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("tavily")) return new Response("down", { status: 503 });
      return new Response(JSON.stringify({ data: [{ title: "Result", url: "https://example.com", description: "Snippet" }] }), { status: 200 });
    });
    const { searchWeb } = await import("@/lib/integrations/research.server");
    const outcome = await searchWeb("roofers in Durham", 3);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.results[0]?.source.provider).toBe("jina");
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit | undefined)?.redirect === "manual")).toBe(true);
    delete process.env["TAVILY_API_KEY"];
    delete process.env["JINA_API_KEY"];
  });

  it("is a Jarvis read action", () => {
    expect(parseActions([{ id: "web.search", args: { query: "Raleigh HVAC pricing" } }], []).reads).toEqual([{ id: "web.search", query: "Raleigh HVAC pricing" }]);
  });
});
