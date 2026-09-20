/**
 * LIVE FREE-MODEL DISCOVERY.
 *
 * Discovery widens the pool of models Revora may pick; it must never relax the
 * free-only rule, and it must never hand back a model that cannot write (a
 * safety classifier, an embedder, a speech model or a LoRA adapter variant).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "GOOGLE_AI_FREE_API_KEY";

async function discovery() {
  vi.resetModules();
  const module = await import("@/lib/ai/free-models.server");
  module.resetFreeModelDiscovery();
  return module;
}

describe("google free-model discovery", () => {
  const original = process.env[KEY];

  beforeEach(() => {
    process.env[KEY] = "google-free-key";
  });

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
    vi.unstubAllGlobals();
  });

  function stubCatalogue(models: { name: string; supportedGenerationMethods?: string[] }[]) {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ models }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("keeps the free flash/lite/gemma classes and drops the paid pro classes", async () => {
    const fetchMock = stubCatalogue([
      { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemma-4-31b-it", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.1-pro-preview", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-embedding-2", supportedGenerationMethods: ["embedContent"] },
    ]);
    const { refreshFreeModels, discoveredFreeModels } = await discovery();

    const models = await refreshFreeModels("google", { apiKey: "google-free-key" });

    expect(models).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemma-4-31b-it"]);
    expect(discoveredFreeModels("google")).toEqual(models);
    // The key travels in a header, never in the logged URL.
    const calls = fetchMock.mock.calls as unknown as unknown[][];
    expect(String(calls[0]?.[0])).not.toContain("google-free-key");
  });

  it("picks a discovered model per role and never one for image or voice", async () => {
    stubCatalogue([
      { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
    ]);
    const { refreshFreeModels, pickDiscoveredModel } = await discovery();
    await refreshFreeModels("google", { apiKey: "google-free-key" });

    expect(pickDiscoveredModel("google", "fast")).toMatch(/flash/);
    expect(pickDiscoveredModel("google", "image")).toBeNull();
    expect(pickDiscoveredModel("google", "transcription")).toBeNull();
  });

  it("offers the whole free pool as ranked failover candidates per role", async () => {
    stubCatalogue([
      { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemma-3-27b-it", supportedGenerationMethods: ["generateContent"] },
    ]);
    const { refreshFreeModels, pickDiscoveredModels } = await discovery();
    await refreshFreeModels("google", { apiKey: "google-free-key" });

    const design = pickDiscoveredModels("google", "design", 3);
    expect(design.length).toBeGreaterThan(1);
    expect(new Set(design).size).toBe(design.length);
    // Design prefers the bigger model, not the cheap lite one.
    expect(design[0]).toContain("27b");
    // Strict roles still refuse a name-based guess.
    expect(pickDiscoveredModels("google", "image", 3)).toEqual([]);
  });

  it("treats a failing catalogue as no discovery, never as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const { refreshFreeModels } = await discovery();
    await expect(refreshFreeModels("google", { apiKey: "google-free-key" })).resolves.toEqual([]);
  });
});
