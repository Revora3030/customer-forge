import { describe, expect, it } from "vitest";
import {
  checkT1,
  checkT2Rejections,
  checkT2Similarity,
  checkT3,
  cosine,
  deterministicGate,
  readSignature,
  STOCK_RIVAL_MECHANICS,
  T2_MAX_COSINE,
} from "./signature-gate";

const good = {
  world: "process",
  verbClass: "scroll/scrub",
  verb: "wind",
  oneLiner: "the one where you wind the clock back through a restoration",
  mechanic: "Scrolling scrubs the owner's 14 real restoration photos from rusted to finished while a rule path draws the timeline. The user drives the restoration with the scroll.",
  medium: "scrubbed-real-media",
  layerSketch: ["media_stack", "rule_path", "scrim", "grain"],
  rejected: [
    { idea: "parallax hero", failedTest: "T2", why: "any rival could ship it" },
    { idea: "an elegant fade", failedTest: "T1", why: "a mood, not a verb" },
  ],
};

describe("T5: structure and layer vocabulary", () => {
  it("accepts a well-formed candidate", () => {
    const { candidate, failures } = readSignature(good);
    expect(failures).toEqual([]);
    expect(candidate?.layerSketch).toEqual(["media_stack", "rule_path", "scrim", "grain"]);
  });

  it("rejects layers outside the hero-stage vocabulary, unknown enums and non-objects", () => {
    expect(readSignature({ ...good, layerSketch: ["media_stack", "webgl_scene"] }).failures).toEqual([
      expect.objectContaining({ test: "T5", reason: expect.stringContaining("webgl_scene") }),
    ]);
    expect(readSignature({ ...good, medium: "three.js" }).failures[0]?.test).toBe("T5");
    expect(readSignature({ ...good, world: "vibes" }).failures[0]?.test).toBe("T5");
    expect(readSignature({ ...good, verbClass: "click" }).failures[0]?.test).toBe("T5");
    expect(readSignature({ ...good, layerSketch: [] }).failures[0]?.test).toBe("T5");
    expect(readSignature(null).candidate).toBeNull();
    expect(readSignature([good]).candidate).toBeNull();
  });
});

describe("T1: names a verb, not a mood", () => {
  it("passes approved verbs, including simple inflections", () => {
    expect(checkT1({ oneLiner: "the one where you drag the hull through the water" })).toEqual([]);
    expect(checkT1({ oneLiner: "The one where you steers the van" })).toEqual([]);
    expect(checkT1({ oneLiner: "the one where you sanding" })).toEqual([]);
  });

  it("fails moods, adjectives and the wrong frame", () => {
    expect(checkT1({ oneLiner: "the one where you feel calm" })[0]?.test).toBe("T1");
    expect(checkT1({ oneLiner: "the one with nice scroll reveals" })[0]?.test).toBe("T1");
    expect(checkT1({ oneLiner: "a beautiful site" })[0]?.test).toBe("T1");
  });
});

describe("T3: legible", () => {
  it("caps the one-liner at 90 characters", () => {
    expect(checkT3({ oneLiner: `the one where you drag ${"x".repeat(67)}` })).toEqual([]);
    expect(checkT3({ oneLiner: `the one where you drag ${"x".repeat(68)}` })[0]?.test).toBe("T3");
  });

  it("bans mood words as whole words", () => {
    expect(checkT3({ oneLiner: "the one where you scroll through a cinematic garage" })[0]?.reason).toContain("cinematic");
    expect(checkT3({ oneLiner: "the one where you sweep a Premium light" })[0]?.reason).toContain("premium");
    expect(checkT3({ oneLiner: "the one where you press the premiumness" })).toEqual([]);
  });
});

describe("T2: bespoke", () => {
  it("needs at least two rejected ideas", () => {
    expect(checkT2Rejections({ rejected: good.rejected })).toEqual([]);
    expect(checkT2Rejections({ rejected: good.rejected.slice(0, 1) })[0]?.test).toBe("T2");
  });

  it(`fails a mechanic above cosine ${T2_MAX_COSINE} to a stock rival mechanic, and names it`, () => {
    const rivals = STOCK_RIVAL_MECHANICS.map((_, i) => Array.from({ length: 12 }, (_, j) => (j === i ? 1 : 0)));
    const nearParallax = rivals[1]!.map((v, j) => (j === 1 ? v : j === 11 ? 0.3 : 0));
    const result = checkT2Similarity(nearParallax, rivals);
    expect(result.maxCosine).toBeGreaterThan(T2_MAX_COSINE);
    expect(result.failures[0]?.reason).toContain("parallax");
    const bespoke = Array.from({ length: 12 }, (_, j) => (j === 11 ? 1 : j === 0 ? 0.5 : 0));
    expect(checkT2Similarity(bespoke, rivals).failures).toEqual([]);
  });

  it("cosine is safe on mismatched or zero vectors", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1], [1, 2])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("the deterministic gate", () => {
  it("passes the good candidate and collects every failure for a bad one", () => {
    expect(deterministicGate(readSignature(good).candidate!)).toEqual([]);
    const bad = readSignature({ ...good, oneLiner: "the one where you feel a stunning, seamless and elegant mood across the whole page forever and ever", rejected: [] }).candidate!;
    expect(deterministicGate(bad).map((f) => f.test).sort()).toEqual(["T1", "T2", "T3", "T3"]);
  });
});
