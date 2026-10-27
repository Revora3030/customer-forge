import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ineligibleReason, parseCatalogue, routeStatus, staleRosterIds, surfaceFor } from "./catalogue";
import { catalogueFilterFor, liveCatalogue, resetCatalogueCache } from "./catalogue.server";
import { LOVABLE_CONVERSATION_MODELS, parsePickedModel } from "./lovable-models";

const entry = (id: string, surfaces: string[], extra: Record<string, unknown> = {}) => ({
  id,
  deprecated: false,
  supported_surfaces: surfaces,
  modalities: { input: ["text", "image"], output: ["text"] },
  data_retention_by_surface: Object.fromEntries(surfaces.map((s) => [s, "zero"])),
  ...extra,
});

const PAYLOAD = {
  data: [
    entry("openai/gpt-6.1-sol", ["chat-completions", "responses"]),
    entry("openai/gpt-5.5-pro", ["responses"]),
    entry("openai/gpt-5", ["chat-completions", "responses"], { deprecated: true }),
    entry("anthropic/claude-sonnet-5", ["messages"], { data_retention_by_surface: { messages: "provider_retained" } }),
    entry("google/gemini-3.6-flash", ["chat-completions"], { data_retention_by_surface: { "chat-completions": "provider_retained" } }),
    entry("google/gemini-3.1-flash-lite", ["chat-completions"], { modalities: { input: ["text"], output: ["text"] } }),
    entry("openai/gpt-image-2", ["image-generation", "image-edit"], { modalities: { input: ["text", "image"], output: ["image"] } }),
    entry("openai/gpt-transcribe", ["transcription"]),
    entry("google/veo-3.1", ["videos"], { modalities: { input: ["text"], output: ["video"] } }),
    entry("google/gemini-embedding-2", ["embeddings"]),
    entry("google/gemini-2.5-flash-tts", ["speech"], { modalities: { input: ["text"], output: ["audio"] } }),
    { id: "not a model id" },
  ],
};

describe("parseCatalogue", () => {
  it("keeps valid ids and fields, drops malformed rows", () => {
    const models = parseCatalogue(PAYLOAD);
    expect(models).toHaveLength(11);
    expect(models.find((m) => m.id === "openai/gpt-5")?.deprecated).toBe(true);
  });
  it("throws on an empty or malformed listing instead of returning no models", () => {
    expect(() => parseCatalogue({ data: [] })).toThrow();
    expect(() => parseCatalogue({ error: "x" })).toThrow();
    expect(() => parseCatalogue(null)).toThrow();
  });
});

describe("eligibility by surface, deprecation and retention", () => {
  const models = parseCatalogue(PAYLOAD);
  const get = (id: string) => models.find((m) => m.id === id);
  it("routes anthropic to messages and others to chat-completions", () => {
    expect(surfaceFor("design", "anthropic/claude-sonnet-5")).toBe("messages");
    expect(surfaceFor("design", "openai/gpt-6.1-sol")).toBe("chat-completions");
    expect(surfaceFor("image", "openai/gpt-image-2")).toBe("image-generation");
  });
  it("rejects responses-only ids on the chat adapter", () => {
    expect(ineligibleReason(get("openai/gpt-5.5-pro"), "chat-completions")).toMatch(/chat-completions/);
  });
  it("rejects deprecated and missing ids", () => {
    expect(ineligibleReason(get("openai/gpt-5"), "chat-completions")).toMatch(/Deprecated/);
    expect(ineligibleReason(undefined, "chat-completions")).toMatch(/Not in the live catalogue/);
  });
  it("allows retained anthropic messages per policy but blocks other retained surfaces", () => {
    expect(ineligibleReason(get("anthropic/claude-sonnet-5"), "messages")).toBeNull();
    expect(ineligibleReason(get("google/gemini-3.6-flash"), "chat-completions")).toMatch(/Retains data/);
  });
  it("never puts video, speech or embedding ids on a chat route", () => {
    for (const id of ["google/veo-3.1", "google/gemini-embedding-2", "google/gemini-2.5-flash-tts", "openai/gpt-image-2"])
      expect(ineligibleReason(get(id), "chat-completions")).not.toBeNull();
  });
  it("requires image input for vision", () => {
    expect(ineligibleReason(get("google/gemini-3.1-flash-lite"), "chat-completions", true)).toMatch(/images/);
  });
});

describe("routeStatus and stale roster report", () => {
  const models = parseCatalogue(PAYLOAD);
  const rosters = {
    design: ["openai/gpt-6.1-sol", "anthropic/claude-sonnet-5", "openai/gpt-5.5-pro", "openai/retired-x"],
    image: ["openai/gpt-image-2"],
    transcription: ["openai/gpt-transcribe"],
  };
  it("labels every unrouted model with a real reason, never as healthy", () => {
    const status = routeStatus(models, rosters);
    expect(status.find((m) => m.id === "openai/gpt-6.1-sol")?.roles).toEqual(["design"]);
    expect(status.find((m) => m.id === "openai/gpt-image-2")?.roles).toEqual(["image"]);
    expect(status.find((m) => m.id === "openai/gpt-5.5-pro")?.reason).toMatch(/chat-completions/);
    expect(status.find((m) => m.id === "google/gemini-embedding-2")?.reason).toMatch(/Embeddings/);
    expect(status.find((m) => m.id === "google/gemini-2.5-flash-tts")?.reason).toMatch(/Text-to-speech/)
    expect(routeStatus(models, { speech: ["google/gemini-2.5-flash-tts"] }).find((m) => m.id === "google/gemini-2.5-flash-tts")?.roles).toEqual(["speech"]);;
    expect(status.find((m) => m.id === "openai/gpt-5")?.reason).toMatch(/Deprecated/);
    for (const m of status) expect(m.roles.length > 0 || Boolean(m.reason)).toBe(true);
  });
  it("reports roster ids the catalogue can't serve", () => {
    expect(staleRosterIds(models, rosters).map((s) => s.id)).toEqual(["openai/gpt-5.5-pro", "openai/retired-x"]);
  });
});

describe("liveCatalogue (server)", () => {
  beforeEach(() => {
    resetCatalogueCache();
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    vi.stubEnv("AI_CATALOGUE_FILTER", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("reads once, caches, and sends the key only as a bearer header to the gateway", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(PAYLOAD), { status: 200 }));
    const first = await liveCatalogue(fetcher as unknown as typeof fetch);
    await liveCatalogue(fetcher as unknown as typeof fetch);
    expect(first.state).toBe("live");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai.gateway.lovable.dev/v1/models");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
  });

  it("reports unavailable honestly with no key, without calling out", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    const fetcher = vi.fn();
    const snap = await liveCatalogue(fetcher as unknown as typeof fetch);
    expect(snap.state).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports unavailable on an error response and never leaks the key in the error", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 503 }));
    const snap = await liveCatalogue(fetcher as unknown as typeof fetch);
    expect(snap.state).toBe("unavailable");
    expect(snap.error).toMatch(/503/);
    expect(JSON.stringify(snap)).not.toContain("test-key");
  });

  it("keeps the last good copy as stale when a refresh fails", async () => {
    vi.useFakeTimers();
    const ok = vi.fn(async () => new Response(JSON.stringify(PAYLOAD), { status: 200 }));
    await liveCatalogue(ok as unknown as typeof fetch);
    vi.advanceTimersByTime(11 * 60 * 1000);
    const bad = vi.fn(async () => new Response("x", { status: 500 }));
    const snap = await liveCatalogue(bad as unknown as typeof fetch);
    expect(snap.state).toBe("stale");
    expect(snap.models?.length).toBe(11);
  });

  it("router filter drops stale ids and keeps eligible ones; off when disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(PAYLOAD), { status: 200 })));
    const allow = await catalogueFilterFor("design");
    expect(allow?.("openai/gpt-6.1-sol")).toBe(true);
    expect(allow?.("anthropic/claude-sonnet-5")).toBe(true);
    expect(allow?.("openai/gpt-5.5-pro")).toBe(false);
    expect(allow?.("openai/gpt-5")).toBe(false);
    vi.stubEnv("AI_CATALOGUE_FILTER", "off");
    expect(await catalogueFilterFor("design")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("model picker authorization", () => {
  it("accepts only roster ids, never arbitrary or responses-only ids", () => {
    expect(parsePickedModel("openai/gpt-6.1-sol")).toBe("openai/gpt-6.1-sol");
    expect(parsePickedModel("openai/gpt-5.5-pro")).toBeNull();
    expect(parsePickedModel("evil/model")).toBeNull();
    expect(parsePickedModel(42)).toBeNull();
    expect(LOVABLE_CONVERSATION_MODELS).not.toContain("openai/gpt-5.5-pro");
  });
});

import { VEO_REASON } from "./catalogue";
describe("unverified video models", () => {
  it("labels Veo as not routed with the exact blocker", () => {
    const status = routeStatus([{ id: "google/veo-3.1", deprecated: false, surfaces: ["videos"], inputs: ["text"], outputs: ["video"], retentionBySurface: {} }], {});
    expect(status[0]!.roles).toEqual([]);
    expect(status[0]!.reason).toBe(VEO_REASON);
  });
});
