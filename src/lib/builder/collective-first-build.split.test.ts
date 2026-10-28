/**
 * The creative step of a first build used to be ONE request: the whole look
 * and a picture campaign of up to 28 pictures, 9,500 tokens. On a slow model
 * it outran the gateway's two-minute edge limit (a 524), failed, and the retry
 * started again from the first word. It is now two short calls (the look, then
 * the pictures, which can see the look), each saved as it finishes so a retry
 * resumes at the step that failed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DnaFacts } from "@/lib/business-dna";
import type { SiteBrief } from "@/lib/site-brief";
import type { SiteCopy } from "@/lib/site-engine";
import { classifyBuildFailure } from "@/lib/builder/build-failure";
import { blankFirstBuildDirection } from "./first-build-contract";

type Request = { stage?: string; purpose: string; maxOutputTokens?: number; user: string };
const thinker = vi.hoisted(() => ({ callBestThinker: vi.fn() }));
vi.mock("@/lib/ai/thinker.server", () => thinker);

const { refineFirstBuildWithCollective } = await import("./collective-first-build.server");

const facts: DnaFacts = { businessName: "Harbour Detail", industry: "Car detailing", services: ["Evening Detail"], city: "Leeds" };
const ORG = "11111111-1111-4111-8111-111111111111";
const baseline = blankFirstBuildDirection({
  organizationId: ORG,
  businessName: "Harbour Detail",
  industry: "Car detailing",
  description: null,
  city: "Leeds",
  state: null,
  serviceArea: null,
  phone: null,
  email: null,
  yearsInBusiness: null,
  services: [{ name: "Evening Detail" }],
  goals: [],
  conversionGoal: null,
  photoCount: 0,
  testimonialCount: 0,
  bookableServices: 0,
  hasHours: false,
});
const brief = { buyerGoal: "Book a detail", factAnswers: {}, primaryAction: "Book now" } as unknown as SiteBrief;
const copy = {
  heroHeadline: "", heroSubheadline: "", primaryCta: "", secondaryCta: "", intro: "", benefits: [],
  serviceCards: [{ name: "Evening Detail", copy: "" }], faqs: [], areaCopy: "", about: "",
  metaTitle: "", metaDescription: "", ogTitle: "", ogDescription: "",
} as SiteCopy;

const coreJson = {
  brief: {
    concept: "A harbour road at dusk, polished paint holding the last light",
    personality: "calm, exacting, unhurried",
    typography: { display: "Fraunces", body: "Inter", scaleRatio: 1.25 },
    color: { system: "ink navy with a coral accent", strategy: "dark bands alternate with warm paper", accentUse: "buttons and key figures" },
    heroComposition: "full-bleed dusk photograph with the headline low left",
    sectionRhythm: "photographic scenes alternate with tight content bands",
    backgroundTreatment: "edge-to-edge photography under a soft ink scrim",
    photography: { language: "cinematic dusk", lighting: "low amber sunset", environment: "wet harbour road", treatment: "film grade" },
  },
};
const picture = (slot: string, sections: string[]) => ({
  slot, label: slot, purpose: "scene", subject: "a glossy dark sedan on a harbour road at dusk",
  environment: "harbour road", action: "parked", lighting: "low amber sunset", camera: "35mm low three-quarter",
  framing: "wide", focalPoint: "headlight", negativeSpace: "upper left", aspectRatio: "16:9", palette: "ink and coral",
  mood: "calm", section: sections, mobileCrop: "centre", altText: `Sedan at dusk (${slot})`,
});
const campaignJson = {
  brief: {
    imageInventory: [
      picture("hero-harbour", ["hero"]), picture("service-evening", ["services"]), picture("story-garage", ["story"]),
      picture("process-wash", ["process"]), picture("booking-road", ["booking"]), picture("contact-lot", ["contact"]),
    ],
    shotList: {
      continuity: "one golden-hour evening, warm film grade",
      sections: [{ section: "hero", setting: "harbour road", light: "low amber", cameraAngle: "low three-quarter", mood: "calm", paletteTieIn: "coral in reflections", copySpace: "upper left" }],
    },
  },
};

const ok = (value: unknown) => ({
  ok: true, lane: "paid", tier: "sol", wanted: "sol", downgraded: false, text: JSON.stringify(value),
  model: "lovable · openai/gpt-6.1-sol", costMicrocents: 10, attempts: [], handoverReason: null,
});
const failed = (reason = "provider_unavailable", detail = "gateway timeout") => ({
  ok: false, lane: "paid", tier: null, wanted: "sol", reason, detail, attempts: [], handoverReason: null,
});

let calls: Request[];
let campaignWorks: boolean;
beforeEach(() => {
  calls = [];
  campaignWorks = true;
  thinker.callBestThinker.mockReset();
  thinker.callBestThinker.mockImplementation(async (request: Request) => {
    calls.push(request);
    const stage = request.stage ?? request.purpose;
    if (stage === "design_direction") return ok(coreJson);
    if (stage === "picture_campaign" || stage === "picture_campaign_repair") return campaignWorks ? ok(campaignJson) : failed();
    if (request.purpose === "specialist_review") return ok({ approvedFields: [], rejected: [] });
    return failed("provider_unavailable", "not scripted");
  });
});

function memoryCheckpoints() {
  const saved = new Map<string, unknown>();
  const keyOf = (key: string, inputs: unknown) => `${key}:${JSON.stringify(inputs)}`;
  return {
    saved,
    async get<T>(key: string, inputs: unknown): Promise<T | null> {
      return (saved.get(keyOf(key, inputs)) as T | undefined) ?? null;
    },
    async put(key: string, inputs: unknown, value: unknown): Promise<boolean> {
      saved.set(keyOf(key, inputs), JSON.parse(JSON.stringify(value)));
      return true;
    },
  };
}

const run = (extra: Partial<Parameters<typeof refineFirstBuildWithCollective>[0]> = {}) =>
  refineFirstBuildWithCollective({ organizationId: ORG, facts, brief, copy, creative: baseline, ...extra });
const creativeCalls = () => calls.filter((c) => ["design_direction", "picture_campaign", "picture_campaign_repair"].includes(c.stage ?? ""));

describe("the creative step is two short calls, not one long one", () => {
  it("asks for the look first, then the pictures with the look in front of Sol", async () => {
    const result = await run();
    const [core, campaign] = creativeCalls();
    expect(creativeCalls().map((c) => c.stage)).toEqual(["design_direction", "picture_campaign"]);
    // Neither answer is the 9,500-token request that outran the gateway.
    expect(core!.maxOutputTokens).toBeLessThanOrEqual(4000);
    expect(campaign!.maxOutputTokens).toBeLessThanOrEqual(7000);
    // The look call does not also ask for the picture list...
    expect(core!.user).toContain("Do NOT write the picture list");
    expect(core!.user).not.toContain("brief.imageInventory must be");
    // ...and the picture call is shown the concept and palette Sol just chose.
    expect(campaign!.user).toContain("A harbour road at dusk");
    expect(campaign!.user).toContain("ink navy with a coral accent");
    expect(campaign!.user).toContain("brief.imageInventory must be");
    // Sol is told how the pictures will be judged, so it plans frames that pass.
    expect(campaign!.user).toContain("strict photo editor");
    expect(campaign!.user).toContain("badge-bearing fronts");

    expect(result.creativeChanged).toBe(true);
    expect(result.creative.brief.concept).toContain("harbour road");
    expect(result.creative.brief.typography.display).toBe("Fraunces");
    expect(result.creative.brief.imageInventory).toHaveLength(6);
    expect(result.creative.brief.shotList?.sections.map((section) => section.section)).toEqual(["hero"]);
    expect(result.passes.map((p) => p.purpose)).toEqual(expect.arrayContaining(["creative_direction", "picture_campaign"]));
    // Each pass says which fields it contributed.
    expect(result.passes.find((p) => p.purpose === "picture_campaign")?.acceptedFields.sort()).toEqual(["brief.imageInventory", "brief.shotList"]);
    expect(result.passes.find((p) => p.purpose === "creative_direction")?.acceptedFields).not.toContain("brief.imageInventory");
  });

  it("lets the picture call add pictures but never rewrite the look", async () => {
    thinker.callBestThinker.mockImplementation(async (request: Request) => {
      calls.push(request);
      const stage = request.stage ?? request.purpose;
      if (stage === "design_direction") return ok(coreJson);
      if (stage === "picture_campaign") return ok({ brief: { ...campaignJson.brief, concept: "A different concept that must not replace the first" } });
      if (request.purpose === "specialist_review") return ok({ approvedFields: [], rejected: [] });
      return failed();
    });
    const result = await run();
    expect(result.creative.brief.concept).toContain("harbour road");
    expect(result.creative.brief.imageInventory).toHaveLength(6);
    expect(result.passes.find((p) => p.purpose === "picture_campaign")?.acceptedFields).not.toContain("brief.concept");
  });

  it("keeps a complete picture campaign the look answer already carried when the picture call fails", async () => {
    thinker.callBestThinker.mockImplementation(async (request: Request) => {
      calls.push(request);
      const stage = request.stage ?? request.purpose;
      if (stage === "design_direction") return ok({ brief: { ...coreJson.brief, ...campaignJson.brief } });
      if (stage === "picture_campaign" || stage === "picture_campaign_repair") return failed();
      if (request.purpose === "specialist_review") return ok({ approvedFields: [], rejected: [] });
      return failed();
    });
    const result = await run();
    expect(result.creative.brief.imageInventory).toHaveLength(6);
    // Nothing was missing, so no repair call was spent.
    expect(creativeCalls().map((c) => c.stage)).toEqual(["design_direction", "picture_campaign"]);
  });

  it("reports each step by name as it starts", async () => {
    const steps: string[] = [];
    await run({ onStep: (label: string) => steps.push(label) });
    expect(steps).toEqual(["planning your design direction", "planning your picture campaign", "writing your wording"]);
  });

  it("never lets a failing progress reporter break the build", async () => {
    const result = await run({ onStep: () => { throw new Error("progress table down"); } });
    expect(result.creative.brief.imageInventory).toHaveLength(6);
  });
});

describe("a retry resumes at the step that failed", () => {
  it("saves the look before the pictures, so a failed picture call does not redo the look", async () => {
    const checkpoints = memoryCheckpoints();
    campaignWorks = false;
    await expect(run({ checkpoints })).rejects.toThrow(/did not plan this site's pictures/);
    // The look finished and is saved; the pictures did not, so they are not.
    expect([...checkpoints.saved.keys()].map((k) => k.split(":")[0])).toEqual(["creative-core"]);
    // The campaign call and its one smaller repair were both tried.
    expect(creativeCalls().map((c) => c.stage)).toEqual(["design_direction", "picture_campaign", "picture_campaign_repair"]);

    calls = [];
    campaignWorks = true;
    const retried = await run({ checkpoints });
    // Only the pictures were asked for: the look came back from the saved work.
    expect(creativeCalls().map((c) => c.stage)).toEqual(["picture_campaign"]);
    expect(retried.creative.brief.concept).toContain("harbour road");
    expect(retried.creative.brief.imageInventory).toHaveLength(6);
    expect([...checkpoints.saved.keys()].map((k) => k.split(":")[0]).sort()).toEqual(["creative-core", "creative-direction"]);

    // A third run needs no creative call at all.
    calls = [];
    const resumed = await run({ checkpoints });
    expect(creativeCalls()).toEqual([]);
    expect(resumed.creative.brief.imageInventory).toHaveLength(6);
    expect(resumed.creativeChanged).toBe(true);
  });

  it("does not reuse saved work when the facts it was made from have changed", async () => {
    const checkpoints = memoryCheckpoints();
    await run({ checkpoints });
    calls = [];
    await run({ checkpoints, facts: { ...facts, city: "York" } });
    expect(creativeCalls().map((c) => c.stage)).toEqual(["design_direction", "picture_campaign"]);
  });

  it("does not save a look that is still missing its type, concept or colour", async () => {
    const checkpoints = memoryCheckpoints();
    thinker.callBestThinker.mockImplementation(async (request: Request) => {
      calls.push(request);
      const stage = request.stage ?? request.purpose;
      if (stage === "design_direction") return ok({ brief: { personality: "calm" } });
      if (request.purpose === "specialist_review") return ok({ approvedFields: [], rejected: [] });
      return failed();
    });
    await expect(run({ checkpoints })).rejects.toThrow(/did not choose this site's typography/);
    expect(checkpoints.saved.size).toBe(0);
  });
});

describe("when the providers never answer, the failure says so", () => {
  it("stops with a message the build classifies as a provider problem, not a picture problem", async () => {
    campaignWorks = false;
    const error = await run().then(() => null, (e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toMatch(/did not plan this site's pictures/);
    expect(error?.message).toMatch(/AI providers did not answer in time/);
    expect(classifyBuildFailure(error)).toMatchObject({ kind: "provider", retryable: true });
  });
});
