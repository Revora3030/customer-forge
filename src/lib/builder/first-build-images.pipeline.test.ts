import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inFlight: 0,
  peak: 0,
  generated: 0,
  reviews: 0,
  reviewMode: "pass" as "pass" | "outage" | "reject-first",
}));

vi.mock("@/lib/ai/paid-image.server", () => ({
  paidImageStatus: () => ({ allowed: false, message: "paid lane off" }),
  generatePaidImageBase64: vi.fn(),
}));

vi.mock("@/lib/image-studio.server", () => ({
  decodeBase64: () => new Uint8Array([1, 2, 3]),
  generateImageBase64: async () => {
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    state.inFlight -= 1;
    state.generated += 1;
    return { ok: true, base64: "AAAA", mimeType: "image/png", provider: "cloudflare", model: "flux", source: "generated", cached: false };
  },
}));

vi.mock("@/lib/ai/photo-direction.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/photo-direction.server")>(
    "@/lib/ai/photo-direction.server",
  );
  return {
    ...actual,
    inspectPhoto: async () => {
      state.reviews += 1;
      if (state.reviewMode === "outage")
        return { publishable: false, defects: ["unavailable"], revisedPrompt: null, reviewed: false, contentRejected: false, reviewFailed: true };
      if (state.reviewMode === "reject-first" && state.reviews === 1)
        return { publishable: false, defects: ["warped wheel"], revisedPrompt: "x".repeat(80), reviewed: true, contentRejected: true, reviewFailed: false };
      return { publishable: true, defects: [], revisedPrompt: null, reviewed: true, contentRejected: false, reviewFailed: false };
    },
  };
});

import { blankFirstBuildDirection } from "./first-build-contract";
import { generateFirstBuildImages } from "./first-build-images.server";

function creative(count: number) {
  const direction = blankFirstBuildDirection({
    organizationId: "11111111-1111-4111-8111-111111111111",
    businessName: "Northline Detail",
    industry: "Automotive detailing",
    description: "Mobile vehicle detailing",
    city: "Leeds",
    state: null,
    serviceArea: "Leeds",
    phone: null,
    email: null,
    yearsInBusiness: null,
    services: [{ name: "Interior detail" }],
    goals: ["quotes"],
    conversionGoal: "quotes",
    photoCount: 0,
    testimonialCount: 0,
    bookableServices: 0,
    hasHours: false,
  });
  direction.brief.imageInventory = Array.from({ length: count }, (_, index) => ({
    slot: index === 0 ? "hero" : "service",
    label: `Shot ${index + 1}`,
    purpose: "Support the page",
    subject: "A clean detailed vehicle",
    environment: "Bright bay",
    action: "Stationary",
    lighting: "Daylight",
    camera: "Editorial",
    framing: "Wide",
    focalPoint: "right",
    negativeSpace: "left",
    aspectRatio: "16:9",
    palette: "Neutral",
    mood: "Precise",
    section: [index === 0 ? "hero" : "services"],
    mobileCrop: "Keep subject visible",
    altText: `Clean detailed vehicle ${index + 1}`,
    constraints: ["no text"],
    evidenceTag: "AI_GENERATED_MARKETING_VISUAL",
  }));
  return direction;
}

function fakeDb() {
  return {
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
    from: () => ({
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: crypto.randomUUID() }, error: null }) }) }),
    }),
  } as never;
}

const input = (count: number) => ({
  organizationId: "11111111-1111-4111-8111-111111111111",
  userId: null,
  businessName: "Northline Detail",
  city: "Leeds",
  photoCount: 0,
  creative: creative(count),
});

describe("first-build picture pipeline", () => {
  beforeEach(() => {
    Object.assign(state, { inFlight: 0, peak: 0, generated: 0, reviews: 0, reviewMode: "pass" });
    delete process.env["FIRST_BUILD_IMAGE_CONCURRENCY"];
    delete process.env["VISUAL_REVIEW_UNAVAILABLE_POLICY"];
  });

  it("generates pictures concurrently (bounded) and keeps campaign order", async () => {
    const result = await generateFirstBuildImages(fakeDb(), input(9));
    expect(state.peak).toBeGreaterThan(1);
    expect(state.peak).toBeLessThanOrEqual(3);
    expect(result.assets.map((asset) => asset.label)).toEqual(Array.from({ length: 9 }, (_, i) => `Shot ${i + 1}`));
    expect(result.evidence.status).toBe("generated");
  });

  it("never regenerates a picture because the review was unavailable", async () => {
    state.reviewMode = "outage";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await generateFirstBuildImages(fakeDb(), input(4));
    warn.mockRestore();
    expect(state.generated).toBe(4);
    expect(state.reviews).toBe(4);
    expect(result.assets).toHaveLength(4);
  });

  it("leaves the slot empty (still without a reshoot) under the strict policy", async () => {
    state.reviewMode = "outage";
    process.env["VISUAL_REVIEW_UNAVAILABLE_POLICY"] = "reject";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await generateFirstBuildImages(fakeDb(), input(2));
    warn.mockRestore();
    expect(state.generated).toBe(2);
    expect(result.assets).toHaveLength(0);
    expect(result.evidence.skipped.every((entry) => /could not be quality-checked/.test(entry.reason))).toBe(true);
  });

  it("reshoots exactly once for a genuine Terra rejection", async () => {
    process.env["FIRST_BUILD_IMAGE_CONCURRENCY"] = "1";
    state.reviewMode = "reject-first";
    const result = await generateFirstBuildImages(fakeDb(), input(1));
    expect(state.generated).toBe(2);
    expect(state.reviews).toBe(2);
    expect(result.assets).toHaveLength(1);
  });
});
