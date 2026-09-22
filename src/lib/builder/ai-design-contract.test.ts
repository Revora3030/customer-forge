import { describe, expect, it } from "vitest";
import {
  CREATIVE_AUTHORITY,
  REQUIRED_RESPONSIVE_WIDTHS,
  applyDesignContract,
  validateAiDesignContract,
  type AiDesignContract,
  type MaterialPage,
} from "@/lib/builder/ai-design-contract";
import {
  CreativeAuthorityError,
  requireAiDesignContract,
} from "@/lib/builder/creative-authority";
import { inspectMediaIntegrity } from "@/lib/builder/media-integrity";
import { DEVICE_MATRIX } from "@/lib/builder/responsive-matrix";

function contract(overrides: Partial<AiDesignContract> = {}): AiDesignContract {
  const responsive = Object.fromEntries(
    REQUIRED_RESPONSIVE_WIDTHS.map((width) => [
      width,
      {
        order: ["home-hero-0", "home-services-1"],
        typeScale: 1,
        cta: "inline",
        columns: width < 500 ? 1 : 3,
        imageCrop: "wide",
        nav: width < 500 ? "drawer" : "full",
      },
    ]),
  ) as AiDesignContract["pages"][number]["responsive"];
  return {
    authority: CREATIVE_AUTHORITY,
    directedBy: "gpt-5.6-sol",
    reviewedBy: "gpt-5.6-terra",
    identity: { name: "Ridge Detailing", concept: "cinematic dark editorial", personality: ["precise"], differentiators: [] },
    typography: { display: "Canela", body: "Inter", scaleRatio: 1.25, headlineCase: "title", headlineWeight: 600, measureCh: 66 },
    color: { background: "#050505", surface: "#101010", text: "#f5f5f5", accent: "#c8a24a", extras: {}, mode: "dark" },
    backgrounds: ["layered"],
    spacing: { baseline: 8, sectionRhythm: [72, 96, 128], density: "balanced" },
    grid: { container: 1200, columns: 12, gutter: 24, behaviour: "edge-to-edge" },
    navigation: { structure: "overlay-to-solid", items: ["Home"], behaviour: "drawer on phones" },
    hero: { composition: "full-bleed", mediaTreatment: "cinematic", intent: "book a detail" },
    cta: { system: "gold pill", primary: "Book now", secondary: null, placement: ["hero"] },
    cards: { style: "bordered", mediaRatio: "4:3" },
    forms: { layout: "stacked", fields: ["name"] },
    imagery: { artDirection: "night garage", treatment: "cinematic", slots: ["hero"] },
    motion: { pattern: "reveal", intensity: "subtle" },
    accessibility: { minContrast: 4.5, minTouchTargetPx: 44, reducedMotionSafe: true },
    conversion: { goal: "enquiries", steps: ["see work", "book"] },
    pages: [
      {
        slug: "home",
        title: "Home",
        purpose: "convince and book",
        primaryAction: "Book now",
        sections: [
          { id: "home-hero-0", role: "hero", layout: "full-bleed", intent: "open strong", media: "required", emphasis: 1 },
          { id: "home-services-1", role: "services", layout: "cards", intent: "show work", media: "optional", emphasis: 2 },
        ],
        responsive,
      },
    ],
    ...overrides,
  };
}

const material = (): MaterialPage[] => [
  {
    slug: "home",
    sections: [
      { kind: "services", components: [] },
      { kind: "hero", media_url: "https://cdn.example.test/hero.jpg", components: [] },
      { kind: "legacy_preset_band", components: [] },
    ],
  } as unknown as MaterialPage,
  { slug: "old-template-page", sections: [{ kind: "hero", components: [] }] } as unknown as MaterialPage,
];

describe("AI design contract is the only creative authority", () => {
  it("accepts only the AI as the authority", () => {
    const bad = contract({ authority: "deterministic_template" as never });
    expect(validateAiDesignContract(bad).valid).toBe(false);
    expect(validateAiDesignContract(contract()).valid).toBe(true);
  });

  it("rejects any contract that smuggles in a template or preset id", () => {
    const smuggled = contract() as unknown as Record<string, unknown>;
    smuggled["templateId"] = "automotive-dark-3";
    const result = validateAiDesignContract(smuggled as unknown as AiDesignContract);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => /template/i.test(v.detail) || /template/i.test(v.path))).toBe(true);
  });

  it("never silently falls back to a legacy design when the AI produces nothing", () => {
    expect(() => requireAiDesignContract({ attempt: null, attempts: 3 })).toThrow(CreativeAuthorityError);
  });

  it("fails loudly instead of shipping an invalid design", () => {
    try {
      requireAiDesignContract({ attempt: contract({ pages: [] }), attempts: 1 });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CreativeAuthorityError);
      expect((error as CreativeAuthorityError).violations.length).toBeGreaterThan(0);
    }
  });

  it("drops material the AI did not place and keeps the AI's order", () => {
    const applied = applyDesignContract(material(), contract());
    expect(applied.pages.map((page) => page.slug)).toEqual(["home"]);
    expect(applied.pages[0]!.sections.map((section) => section.kind)).toEqual(["hero", "services"]);
    expect(applied.dropped.some((entry) => entry.includes("legacy_preset_band"))).toBe(true);
    expect(applied.dropped.some((entry) => entry.includes("old-template-page"))).toBe(true);
  });

  it("supports genuinely different site structures", () => {
    const other = contract({
      pages: [
        {
          ...contract().pages[0]!,
          slug: "home",
          sections: [
            { id: "home-gallery-0", role: "gallery", layout: "immersive", intent: "lead with work", media: "required", emphasis: 1 },
          ],
          responsive: Object.fromEntries(
            REQUIRED_RESPONSIVE_WIDTHS.map((w) => [w, { order: ["home-gallery-0"], typeScale: 1, cta: "inline", columns: 1, imageCrop: "wide", nav: w < 500 ? "drawer" : "full" }]),
          ) as AiDesignContract["pages"][number]["responsive"],
        },
      ],
    });
    expect(validateAiDesignContract(other).valid).toBe(true);
    expect(other.pages[0]!.sections[0]!.role).toBe("gallery");
  });

  it("specifies responsive behaviour at every required width, including 430", () => {
    expect(REQUIRED_RESPONSIVE_WIDTHS).toContain(430);
    for (const width of REQUIRED_RESPONSIVE_WIDTHS)
      expect(contract().pages[0]!.responsive[width]).toBeTruthy();
    const widths = DEVICE_MATRIX.map((device) => device.width);
    for (const width of REQUIRED_RESPONSIVE_WIDTHS) expect(widths).toContain(width);
  });

  it("keeps accessibility floors as safety, not creative choices", () => {
    expect(validateAiDesignContract(contract({ accessibility: { minContrast: 3, minTouchTargetPx: 44, reducedMotionSafe: true } })).valid).toBe(false);
    expect(validateAiDesignContract(contract({ accessibility: { minContrast: 4.5, minTouchTargetPx: 30, reducedMotionSafe: true } })).valid).toBe(false);
  });
});

describe("media integrity", () => {
  it("reports a required visual area with no picture behind it", () => {
    const pages = [
      { slug: "home", sections: [{ kind: "hero", components: [] }] } as unknown as MaterialPage,
    ];
    const violations = inspectMediaIntegrity(pages, contract());
    expect(violations[0]?.kind).toBe("empty_required_media");
    expect(violations[0]?.remedy).toBe("generate_image");
  });

  it("reports image blocks that would render as empty boxes", () => {
    const pages = [
      {
        slug: "home",
        sections: [
          { kind: "hero", media_url: "https://cdn.example.test/a.jpg", components: [{ kind: "image", media_url: "" }] },
        ],
      } as unknown as MaterialPage,
    ];
    expect(inspectMediaIntegrity(pages, contract()).some((v) => v.kind === "image_component_without_source")).toBe(true);
  });

  it("passes when every required area has a real picture", () => {
    expect(inspectMediaIntegrity(material(), contract())).toEqual([]);
  });
});
