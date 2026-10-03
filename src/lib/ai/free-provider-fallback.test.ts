/**
 * Cohere free-model discovery and credential fallback tests.
 *
 * Cohere's catalogue uses `{ models: [{ name }] }` rather than the OpenAI
 * `{ data: [{ id }] }` shape, so it has a dedicated parser. These tests verify
 * that the parser correctly extracts free-eligible models and that the
 * credential fallbacks activate providers regardless of which secret name
 * variant was saved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const COHERE_KEY = "COHERE_API_KEY";
const COHERE_KEY_ALT = "Cohere";
const MISTRAL_KEY = "MISTRAL_API_KEY";
const MISTRAL_KEY_ALT = "Mistral";
const DEEPSEEK_KEY = "DEEPSEEK_API_KEY";
const DEEPSEEK_KEY_ALT = "Deepseek";
const CEREBRAS_KEY = "CEREBRAS_API_KEY";
const CEREBRAS_KEY_ALT = "Cerebras";
const HF_KEY = "HUGGINGFACE_API_KEY";
const HF_KEY_ALT = "Huggingface";

async function discovery() {
  vi.resetModules();
  const module = await import("@/lib/ai/free-models.server");
  module.resetFreeModelDiscovery();
  return module;
}

async function loadFree() {
  vi.resetModules();
  const module = await import("@/lib/ai/free");
  return module;
}

describe("cohere free-model discovery", () => {
  const originalCohere = process.env[COHERE_KEY];

  beforeEach(() => {
    process.env[COHERE_KEY] = "cohere-test-key";
  });

  afterEach(() => {
    if (originalCohere === undefined) delete process.env[COHERE_KEY];
    else process.env[COHERE_KEY] = originalCohere;
    vi.unstubAllGlobals();
  });

  function stubCohereCatalogue(models: { name: string }[]) {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ models }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("parses the { models: [{ name }] } format and keeps only free-eligible ids", async () => {
    stubCohereCatalogue([
      { name: "command-a-plus-05-2026" },
      { name: "command-r7b-12-2024" },
      { name: "north-mini-code" },
      { name: "embed-english-v3" },
      { name: "c4ai-aya-expanse-8b" },
      { name: "some-paid-model" },
    ]);
    const { refreshFreeModels, discoveredFreeModels } = await discovery();

    const models = await refreshFreeModels("cohere", { apiKey: "cohere-test-key" });

    expect(models).toContain("command-a-plus-05-2026");
    expect(models).toContain("command-r7b-12-2024");
    expect(models).toContain("north-mini-code");
    // Embedders cannot write an answer, so they never join the team.
    expect(models).not.toContain("embed-english-v3");
    expect(models).toContain("c4ai-aya-expanse-8b");
    expect(models).not.toContain("some-paid-model");
    expect(discoveredFreeModels("cohere")).toEqual(models);
  });

  it("handles an empty models array gracefully", async () => {
    stubCohereCatalogue([]);
    const { refreshFreeModels } = await discovery();

    const models = await refreshFreeModels("cohere", { apiKey: "cohere-test-key" });
    expect(models).toEqual([]);
  });

  it("treats a failing catalogue as no discovery, never as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const { refreshFreeModels } = await discovery();

    await expect(
      refreshFreeModels("cohere", { apiKey: "cohere-test-key" }),
    ).resolves.toEqual([]);
  });

  it("sends the API key in an authorization header, never in the URL", async () => {
    const fetchMock = stubCohereCatalogue([{ name: "command-a-plus-05-2026" }]);
    const { refreshFreeModels } = await discovery();
    await refreshFreeModels("cohere", { apiKey: "cohere-test-key" });

    const calls = fetchMock.mock.calls as unknown as unknown[][];
    const url = String(calls[0]?.[0]);
    const init = calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(url).not.toContain("cohere-test-key");
    expect(init?.headers?.["authorization"]).toBe("Bearer cohere-test-key");
  });
});

describe("credential fallback variants", () => {
  const keys = [
    COHERE_KEY, COHERE_KEY_ALT,
    MISTRAL_KEY, MISTRAL_KEY_ALT,
    DEEPSEEK_KEY, DEEPSEEK_KEY_ALT,
    CEREBRAS_KEY, CEREBRAS_KEY_ALT,
    HF_KEY, HF_KEY_ALT,
  ];
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of keys) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("reads MISTRAL_API_KEY when present", async () => {
    process.env[MISTRAL_KEY] = "mstrl-test-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("mistral")?.apiKey).toBe("mstrl-test-key");
  });

  it("falls back to the proper-case Mistral secret name", async () => {
    process.env[MISTRAL_KEY_ALT] = "mstrl-fallback-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("mistral")?.apiKey).toBe("mstrl-fallback-key");
  });

  it("reads DEEPSEEK_API_KEY when present", async () => {
    process.env[DEEPSEEK_KEY] = "ds-test-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("deepseek")?.apiKey).toBe("ds-test-key");
  });

  it("falls back to the proper-case Deepseek secret name", async () => {
    process.env[DEEPSEEK_KEY_ALT] = "ds-fallback-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("deepseek")?.apiKey).toBe("ds-fallback-key");
  });

  it("reads CEREBRAS_API_KEY when present", async () => {
    process.env[CEREBRAS_KEY] = "cb-test-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("cerebras")?.apiKey).toBe("cb-test-key");
  });

  it("falls back to the proper-case Cerebras secret name", async () => {
    process.env[CEREBRAS_KEY_ALT] = "cb-fallback-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("cerebras")?.apiKey).toBe("cb-fallback-key");
  });

  it("reads COHERE_API_KEY when present", async () => {
    process.env[COHERE_KEY] = "co-test-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("cohere")?.apiKey).toBe("co-test-key");
  });

  it("falls back to the proper-case Cohere secret name", async () => {
    process.env[COHERE_KEY_ALT] = "co-fallback-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("cohere")?.apiKey).toBe("co-fallback-key");
  });

  it("reads HUGGINGFACE_API_KEY when present", async () => {
    process.env[HF_KEY] = "hf-test-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("huggingface")?.apiKey).toBe("hf-test-key");
  });

  it("falls back to the proper-case Huggingface secret name", async () => {
    process.env[HF_KEY_ALT] = "hf-fallback-key";
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("huggingface")?.apiKey).toBe("hf-fallback-key");
  });

  it("returns null when no credential variant is set", async () => {
    const { freeProviderCredentials } = await loadFree();
    expect(freeProviderCredentials("mistral")).toBeNull();
    expect(freeProviderCredentials("deepseek")).toBeNull();
    expect(freeProviderCredentials("cerebras")).toBeNull();
    expect(freeProviderCredentials("cohere")).toBeNull();
    expect(freeProviderCredentials("huggingface")).toBeNull();
  });
});
