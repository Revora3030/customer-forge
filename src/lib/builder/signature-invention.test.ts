/**
 * Signature invention: one gated call between the brief and the look. It must
 * regenerate on a gate failure, use the embedding check when it can, never
 * throw, and never block a first build when nothing passes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DnaFacts } from "@/lib/business-dna";
import type { SiteBrief } from "@/lib/site-brief";
import type { SiteCopy } from "@/lib/site-engine";
import { blankFirstBuildDirection } from "./first-build-contract";
import { STOCK_RIVAL_MECHANICS } from "./signature-gate";

type Request = { stage?: string; purpose: string; user: string; system: string };
const thinker = vi.hoisted(() => ({ callBestThinker: vi.fn() }));
vi.mock("@/lib/ai/thinker.server", () => thinker);
const router = vi.hoisted(() => ({ embedWithProvider: vi.fn() }));
vi.mock("@/lib/ai/router.server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  embedWithProvider: router.embedWithProvider,
}));

const { inventSignature } = await import("./ai-brand-identity.server");
const { refineFirstBuildWithCollective } = await import("./collective-first-build.server");

const ORG = "11111111-1111-4111-8111-111111111111";
const ok = (value: unknown) => ({
  ok: true, lane: "paid", tier: "terra", wanted: "terra", downgraded: false, text: JSON.stringify(value),
  model: "lovable · openai/gpt-6.1-terra", costMicrocents: 7, attempts: [], handoverReason: null,
});
const failed = (reason = "provider_unavailable") => ({
  ok: false, lane: "paid", tier: null, wanted: "terra", reason, detail: "not scripted", attempts: [], handoverReason: null,
});

const signature = {
  world: "process",
  verbClass: "scroll/scrub",
  verb: "polish",
  oneLiner: "the one where you polish the bonnet from dull to mirror",
  mechanic: "Scrolling crossfades the owner's real before-to-after detailing photos while a light sweep crosses the paint. The visitor drives the polish.",
  medium: "scrubbed-real-media",
  layerSketch: ["media_stack", "light_sweep", "scrim", "grain"],
  rejected: [
    { idea: "parallax hero", failedTest: "T2", why: "stock" },
    { idea: "a sleek reveal", failedTest: "T1", why: "mood" },
  ],
};

const input = {
  organizationId: ORG,
  businessName: "Harbour Detail",
  industry: "Car detailing",
  city: "Leeds",
  proof: null,
  photoCount: 8,
  videoSeconds: null,
  spine: "Every car is finished by hand at dusk.",
};
const unit = (i: number, n = STOCK_RIVAL_MECHANICS.length + 2) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));
const bespokeVectors = () => [unit(STOCK_RIVAL_MECHANICS.length + 1), ...STOCK_RIVAL_MECHANICS.map((_, i) => unit(i))];

let calls: Request[];
beforeEach(() => {
  calls = [];
  thinker.callBestThinker.mockReset();
  router.embedWithProvider.mockReset();
  router.embedWithProvider.mockResolvedValue(null);
});

describe("inventSignature", () => {
  it("returns a gated signature, marked T4-unproven, after one call", async () => {
    thinker.callBestThinker.mockImplementation(async (r: Request) => (calls.push(r), ok(signature)));
    const embed = vi.fn(async () => bespokeVectors());
    const out = await inventSignature({ ...input, embed });
    expect(out.signature).toMatchObject({ verb: "polish", signatureUnproven: true, t2: { embeddingChecked: true, maxCosine: 0 } });
    expect(out.attempts).toBe(1);
    expect(out.costMicrocents).toBe(7);
    expect(calls[0]?.stage).toBe("signature_invention");
    expect(calls[0]?.user).toContain("assets: 8 owner photos");
    expect(calls[0]?.user).toContain("spine: Every car is finished by hand at dusk.");
    expect(embed).toHaveBeenCalledWith([signature.mechanic, ...STOCK_RIVAL_MECHANICS]);
  });

  it("regenerates once with the gate's reasons, then accepts the passing candidate", async () => {
    let n = 0;
    thinker.callBestThinker.mockImplementation(async (r: Request) => {
      calls.push(r);
      n += 1;
      return ok(n === 1 ? { ...signature, oneLiner: "the one with stunning reveals" } : signature);
    });
    const out = await inventSignature({ ...input, embed: async () => bespokeVectors() });
    expect(out.signature?.oneLiner).toBe(signature.oneLiner);
    expect(out.attempts).toBe(2);
    expect(calls[1]?.user).toContain("YOUR PREVIOUS SIGNATURE FAILED THE GATE");
    expect(calls[1]?.user).toMatch(/T1: .*the one where you/);
  });

  it("fails T2 when the mechanic embeds next to a stock rival mechanic", async () => {
    thinker.callBestThinker.mockImplementation(async () => ok(signature));
    const parallax = [unit(1), ...STOCK_RIVAL_MECHANICS.map((_, i) => unit(i))];
    const out = await inventSignature({ ...input, embed: async () => parallax });
    expect(out.signature).toBeNull();
    expect(out.attempts).toBe(2);
    expect(out.failures[0]).toMatchObject({ test: "T2" });
  });

  it("falls back to the deterministic half of T2 when embeddings are unavailable", async () => {
    thinker.callBestThinker.mockImplementation(async () => ok(signature));
    const out = await inventSignature({ ...input, embed: async () => { throw new Error("no key"); } });
    expect(out.signature?.t2).toEqual({ embeddingChecked: false, maxCosine: null });
  });

  it("never throws: provider failures and junk answers give signature null", async () => {
    thinker.callBestThinker.mockImplementation(async () => failed());
    expect((await inventSignature(input)).signature).toBeNull();
    thinker.callBestThinker.mockImplementation(async () => ok("not json"));
    expect((await inventSignature(input)).signature).toBeNull();
    thinker.callBestThinker.mockImplementation(async () => { throw new Error("boom"); });
    expect((await inventSignature(input)).signature).toBeNull();
  });
});

describe("first build wiring", () => {
  const facts: DnaFacts = { businessName: "Harbour Detail", industry: "Car detailing", services: ["Evening Detail"], city: "Leeds", photoCount: 8 };
  const baseline = blankFirstBuildDirection({
    organizationId: ORG, businessName: "Harbour Detail", industry: "Car detailing", description: null, city: "Leeds",
    state: null, serviceArea: null, phone: null, email: null, yearsInBusiness: null, services: [{ name: "Evening Detail" }],
    goals: [], conversionGoal: null, photoCount: 8, testimonialCount: 0, bookableServices: 0, hasHours: false,
  });
  const brief = { buyerGoal: "Book a detail", factAnswers: {}, primaryAction: "Book now" } as unknown as SiteBrief;
  const copy = {
    heroHeadline: "", heroSubheadline: "", primaryCta: "", secondaryCta: "", intro: "", benefits: [],
    serviceCards: [{ name: "Evening Detail", copy: "" }], faqs: [], areaCopy: "", about: "",
    metaTitle: "", metaDescription: "", ogTitle: "", ogDescription: "",
  } as SiteCopy;
  const run = () => refineFirstBuildWithCollective({ organizationId: ORG, facts, brief, copy, creative: baseline });

  it("runs before the design direction and hands it the signature", async () => {
    router.embedWithProvider.mockResolvedValue(bespokeVectors());
    thinker.callBestThinker.mockImplementation(async (r: Request) => {
      calls.push(r);
      return r.stage === "signature_invention" ? ok(signature) : failed();
    });
    await run().catch(() => null); // the scripted design team fails after the signature step; only the order and prompt matter here
    const stages = calls.map((c) => c.stage);
    expect(stages[0]).toBe("signature_invention");
    const direction = calls.find((c) => c.stage === "design_direction");
    expect(direction?.user).toContain("SIGNATURE MECHANIC");
    expect(direction?.user).toContain(signature.oneLiner);
  });

  it("is fail-open: no signature means the design direction prompt is unchanged", async () => {
    thinker.callBestThinker.mockImplementation(async (r: Request) => (calls.push(r), failed()));
    await run().catch(() => null);
    const direction = calls.find((c) => c.stage === "design_direction");
    expect(direction).toBeDefined();
    expect(direction?.user).not.toContain("SIGNATURE MECHANIC");
  });
});
