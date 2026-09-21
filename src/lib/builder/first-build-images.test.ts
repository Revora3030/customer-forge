import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import { createDesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { PlannedShot } from "@/lib/visual-direction";

const generatedPng = "A".repeat(1500);
const generateImageBase64 = vi.fn();
const decodeBase64 = vi.fn(() => new Uint8Array(1200));

vi.mock("@/lib/image-studio.server", () => ({
  generateImageBase64,
  decodeBase64,
}));

function shot(overrides: Partial<PlannedShot>): PlannedShot {
  return {
    slot: "hero",
    label: "Hero",
    purpose: "Lead the page",
    aspect: "16:9",
    placement: ["hero"],
    subjectHint: "a premium work scene",
    ...overrides,
  };
}

function creative(shots: PlannedShot[]): FirstBuildCreativeDirection {
  return {
    version: 1,
    industry: {
      id: "automotive",
      label: "Automotive",
      objections: [],
      trust: [],
      avoid: [],
      homeSections: ["hero", "services", "cta"],
      pageSlugs: ["services"],
    },
    audience: "local customers",
    offerHierarchy: [],
    conversion: {
      goal: "quotes",
      primaryCta: "Get a quote",
      secondaryCta: "See services",
      placements: ["hero"],
      stickyMobile: true,
    },
    fingerprint: createDesignFingerprint({
      businessName: "Elite Detailing",
      industry: "automotive",
      city: "Raleigh",
      photoCount: 0,
    }),
    imagery: {
      directionId: "automotive",
      language: "premium vehicle photography",
      treatment: "deep reflections",
      status: "artwork_only",
      shots,
      assetPlan: { slots: [], readiness: 100, missingRequired: [], rationale: [] },
    },
    unknowns: [],
  };
}

function dbMock() {
  const uploads: unknown[] = [];
  const mediaRows: unknown[] = [];
  return {
    uploads,
    mediaRows,
    storage: {
      from: () => ({
        upload: async (...args: unknown[]) => {
          uploads.push(args);
          return { error: null };
        },
        remove: async () => ({ error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (row: unknown) => {
        if (table === "media") mediaRows.push(row);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: "media-1" }, error: null }) }) };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateImageBase64.mockResolvedValue({
    ok: true,
    base64: generatedPng,
    mimeType: "image/png",
    provider: "cloudflare",
    model: "@cf/black-forest-labs/flux-1-schnell",
    source: "generated",
    cached: false,
  });
});

afterEach(() => {
  delete process.env["FIRST_BUILD_IMAGE_MAX"];
});

describe("first-build image lane", () => {
  it("does nothing when owner photos already exist", async () => {
    const { generateFirstBuildImages } = await import("@/lib/builder/first-build-images.server");
    const result = await generateFirstBuildImages(dbMock() as never, {
      organizationId: "org-1",
      userId: "user-1",
      businessName: "Elite Detailing",
      city: "Raleigh",
      photoCount: 3,
      creative: creative([shot({})]),
    });
    expect(result.evidence.status).toBe("owner_photos");
    expect(generateImageBase64).not.toHaveBeenCalled();
  });

  it("keeps generated pictures to safe first-build slots only", async () => {
    const { firstBuildImageShots } = await import("@/lib/builder/first-build-images.server");
    const planned = firstBuildImageShots(
      creative([
        shot({ slot: "hero", label: "Hero" }),
        shot({ slot: "service", label: "Interior" }),
        shot({ slot: "gallery", label: "Gallery proof", placement: ["gallery"] }),
        shot({ slot: "cta", label: "Team result", purpose: "team result proof", placement: ["cta"] }),
        shot({ slot: "hero", label: "Hero" }),
      ]),
      0,
    );
    expect(planned.map((item) => `${item.slot}:${item.label}`)).toEqual([
      "hero:Hero",
      "service:Interior",
    ]);
  });

  it("stores safe generated images with provenance and paid fallback explicitly enabled", async () => {
    const { generateFirstBuildImages } = await import("@/lib/builder/first-build-images.server");
    const db = dbMock();
    const result = await generateFirstBuildImages(db as never, {
      organizationId: "org-1",
      userId: "user-1",
      businessName: "Elite Detailing",
      city: "Raleigh",
      photoCount: 0,
      creative: creative([shot({ slot: "hero", label: "Hero" }), shot({ slot: "cta", label: "CTA" })]),
    });
    expect(result.assets).toHaveLength(2);
    expect(result.evidence).toMatchObject({ status: "generated", generated: 2, attached: 0 });
    expect(generateImageBase64).toHaveBeenCalledWith(
      expect.any(String),
      { organizationId: "org-1", userId: "user-1" },
      { paidFallback: true },
    );
    expect(db.uploads).toHaveLength(2);
    expect(db.mediaRows).toHaveLength(2);
    expect(JSON.stringify(db.mediaRows[0])).toContain("Revora AI generated starter image");
  });
});