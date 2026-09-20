import { describe, expect, it } from "vitest";
import { artworkIsEmpty, generateArtwork } from "./generative-art";
import { planMedia, resolveMediaSources } from "./provider-registry";

describe("generative artwork", () => {
  it("is deterministic for the same site", () => {
    expect(generateArtwork("soft-blobs", 12345)).toEqual(generateArtwork("soft-blobs", 12345));
  });

  it("differs between sites", () => {
    const a = generateArtwork("arc-set", 1);
    const b = generateArtwork("arc-set", 99999);
    expect(JSON.stringify(a.layers)).not.toBe(JSON.stringify(b.layers));
  });

  it("falls back to a known system for an unknown name", () => {
    expect(generateArtwork("not-a-system", 7).system).toBe("soft-blobs");
  });

  it("keeps every layer inside safe bounds", () => {
    for (const system of ["soft-blobs", "ring-set", "dot-grid", "stacked-bars", "orbit", "line-rays"]) {
      for (const layer of generateArtwork(system, 42).layers) {
        expect(layer.opacity).toBeLessThanOrEqual(0.45);
        expect(layer.size).toBeGreaterThan(0);
        expect(layer.rotate).toBeLessThanOrEqual(360);
      }
    }
  });

  it("always marks itself decorative and never describes the business", () => {
    const spec = generateArtwork("halo", 5);
    expect(spec.decorative).toBe(true);
    expect(spec.altText).toMatch(/does not depict/i);
  });

  it("reports the empty system as empty", () => {
    expect(artworkIsEmpty(generateArtwork("none", 3))).toBe(true);
  });
});

describe("media provider registry", () => {
  it("never reports paid image generation as available", () => {
    const sources = resolveMediaSources({ ownerAssetCount: 0, presentSecrets: ["OPENAI_API_KEY"] });
    const ai = sources.find((source) => source.id === "ai_generation")!;
    expect(ai.state).toBe("blocked");
    expect(ai.zeroCost).toBe(false);
  });

  it("only enables stock search when a free-tier key is actually stored", () => {
    expect(
      resolveMediaSources({ ownerAssetCount: 0, presentSecrets: [] }).find((s) => s.id === "stock_search")!.state,
    ).toBe("not_configured");
    expect(
      resolveMediaSources({ ownerAssetCount: 0, presentSecrets: ["PEXELS_API_KEY"] }).find((s) => s.id === "stock_search")!.state,
    ).toBe("available");
  });

  it("prefers the owner's own photos", () => {
    const plan = planMedia({ ownerAssetCount: 3, presentSecrets: ["PEXELS_API_KEY"] });
    expect(plan.source.id).toBe("owner_upload");
    expect(plan.usesGeneratedArt).toBe(false);
  });

  it("uses generated artwork instead of an empty frame", () => {
    const plan = planMedia({ ownerAssetCount: 0, presentSecrets: [] });
    expect(plan.source.id).toBe("generated_art");
    expect(plan.usesGeneratedArt).toBe(true);
  });

  it("refuses artwork where a real photo is required", () => {
    const plan = planMedia({ ownerAssetCount: 0, presentSecrets: [] }, { mustBeReal: true });
    expect(plan.usesGeneratedArt).toBe(false);
    expect(plan.explanation).toMatch(/nothing was invented/i);
  });
});
