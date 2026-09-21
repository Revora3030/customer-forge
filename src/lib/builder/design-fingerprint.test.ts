import { describe, expect, it } from "vitest";
import {
  createDesignFingerprint,
  fingerprintBrief,
  fingerprintVocabularySize,
  readDesignFingerprint,
  rendererVariant,
  rejectStyle,
  writeDesignFingerprint,
  BACKGROUND_SYSTEMS,
  CARD_SYSTEMS,
  COLOR_SYSTEMS,
  CTA_SYSTEMS,
  DECORATIVE_SYSTEMS,
  DESIGN_FAMILIES,
  FAQ_LAYOUTS,
  FOOTER_SYSTEMS,
  FORM_LAYOUTS,
  GALLERY_LAYOUTS,
  HERO_COMPOSITIONS,
  IMAGE_TREATMENTS,
  MOTION_PATTERNS,
  NAV_SYSTEMS,
  PAGE_SHELLS,
  PRICING_LAYOUTS,
  PROOF_LAYOUTS,
  SECTION_COMPOSITIONS,
  SECTION_TRANSITIONS,
  STATS_LAYOUTS,
  TIMELINE_LAYOUTS,
  TYPE_SYSTEMS,
} from "./design-fingerprint";

const base = { businessName: "Harbour Plumbing", industry: "home_services", city: "Bristol" };

describe("design fingerprint", () => {
  it("is deterministic for the same business", () => {
    expect(createDesignFingerprint(base)).toEqual(createDesignFingerprint(base));
  });

  it("gives two businesses in the same industry different designs", () => {
    const a = createDesignFingerprint(base);
    const b = createDesignFingerprint({ ...base, businessName: "Kingsway Plumbing" });
    const differences = [
      a.heroComposition !== b.heroComposition,
      a.backgroundSystem !== b.backgroundSystem,
      a.sectionRhythm !== b.sectionRhythm,
      a.cardSystem !== b.cardSystem,
      a.typeSystem !== b.typeSystem,
      a.colorSystem !== b.colorSystem,
    ].filter(Boolean).length;
    expect(differences).toBeGreaterThanOrEqual(3);
  });

  it("re-rolls when the revision changes", () => {
    expect(createDesignFingerprint({ ...base, revision: 2 }).id).not.toBe(createDesignFingerprint(base).id);
  });

  it("never selects a rejected style", () => {
    const first = createDesignFingerprint(base);
    const second = createDesignFingerprint(base, [first.backgroundSystem]);
    expect(second.backgroundSystem).not.toBe(first.backgroundSystem);
  });

  it("avoids photo-led hero compositions when no photos exist", () => {
    const fingerprint = createDesignFingerprint({ ...base, photoCount: 0 });
    expect(fingerprint.heroComposition).not.toMatch(/media|full-bleed/);
    expect(fingerprint.decorativeSystem).not.toBe("none");
  });

  it("describes artwork honestly when there are no photos", () => {
    expect(createDesignFingerprint({ ...base, photoCount: 0 }).artDirection.subject).toMatch(/depicts nothing/i);
  });

  it("offers a very large design vocabulary", () => {
    expect(fingerprintVocabularySize()).toBeGreaterThan(1_000_000_000);
  });

  it("round-trips through the website settings blob without losing other keys", () => {
    const fingerprint = createDesignFingerprint(base);
    const blob = writeDesignFingerprint({ existing: true }, fingerprint);
    expect(blob["existing"]).toBe(true);
    expect(readDesignFingerprint(blob)?.id).toBe(fingerprint.id);
  });

  it("ignores a malformed stored fingerprint", () => {
    expect(readDesignFingerprint({ designFingerprint: { id: 1 } })).toBeNull();
    expect(readDesignFingerprint(null)).toBeNull();
  });

  it("records rejected styles once", () => {
    const fingerprint = rejectStyle(rejectStyle(createDesignFingerprint(base), "Brutalist"), "brutalist");
    expect(fingerprint.rejected.filter((style) => style === "brutalist")).toHaveLength(1);
  });

  it("writes a brief the planner can follow", () => {
    const brief = fingerprintBrief(createDesignFingerprint(base));
    expect(brief).toMatch(/Design identity already established/);
    expect(brief).toMatch(/Hero composition/);
  });
});

describe("design vocabulary breadth", () => {
  it("meets the required option counts in every pool", () => {
    const pools: Array<[string, readonly unknown[], number]> = [
      ["heroes", HERO_COMPOSITIONS, 30],
      ["navs", NAV_SYSTEMS, 25],
      ["backgrounds", BACKGROUND_SYSTEMS, 25],
      ["colors", COLOR_SYSTEMS, 20],
      ["type", TYPE_SYSTEMS, 20],
      ["ctas", CTA_SYSTEMS, 25],
      ["cards", CARD_SYSTEMS, 25],
      ["sections", SECTION_COMPOSITIONS, 25],
      ["proof", PROOF_LAYOUTS, 20],
      ["pricing", PRICING_LAYOUTS, 20],
      ["faq", FAQ_LAYOUTS, 20],
      ["gallery", GALLERY_LAYOUTS, 20],
      ["stats", STATS_LAYOUTS, 20],
      ["timeline", TIMELINE_LAYOUTS, 20],
      ["forms", FORM_LAYOUTS, 20],
      ["footers", FOOTER_SYSTEMS, 20],
      ["decorative", DECORATIVE_SYSTEMS, 15],
      ["motion", MOTION_PATTERNS, 15],
      ["image treatments", IMAGE_TREATMENTS, 15],
      ["section transitions", SECTION_TRANSITIONS, 15],
      ["page shells", PAGE_SHELLS, 15],
      ["families", DESIGN_FAMILIES, 20],
    ];
    for (const [name, pool, minimum] of pools) {
      expect(pool.length, name).toBeGreaterThanOrEqual(minimum);
      expect(new Set(pool).size, `${name} duplicates`).toBe(pool.length);
    }
  });

  it("assigns a design family, shell, transition and motion pattern", () => {
    const fingerprint = createDesignFingerprint(base);
    expect(DESIGN_FAMILIES).toContain(fingerprint.family);
    expect(PAGE_SHELLS).toContain(fingerprint.pageShell);
    expect(SECTION_TRANSITIONS).toContain(fingerprint.sectionTransition);
    expect(MOTION_PATTERNS).toContain(fingerprint.motionPattern);
    expect(TIMELINE_LAYOUTS).toContain(fingerprint.timelineLayout);
  });

  it("uses no motion pattern when the identity asks for no motion", () => {
    const quiet = [
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
    ]
      .map((name) => createDesignFingerprint({ ...base, businessName: name }))
      .filter((fingerprint) => fingerprint.motionLevel === "none");
    for (const fingerprint of quiet) expect(fingerprint.motionPattern).toBe("none");
  });

  it("leaves image treatment plain until real photos exist", () => {
    expect(createDesignFingerprint({ ...base, photoCount: 0 }).imageTreatment).toBe("plain");
    expect(IMAGE_TREATMENTS).toContain(createDesignFingerprint({ ...base, photoCount: 8 }).imageTreatment);
  });

  it("states in the brief that the identity is never a source of facts", () => {
    expect(fingerprintBrief(createDesignFingerprint(base))).toMatch(/never a source of business facts/i);
  });

  it("maps every creative pool into a renderer-supported visual treatment", () => {
    const pools = [
      ["hero", HERO_COMPOSITIONS],
      ["services", CARD_SYSTEMS],
      ["reviews", PROOF_LAYOUTS],
      ["pricing", PRICING_LAYOUTS],
      ["faq", FAQ_LAYOUTS],
      ["gallery", GALLERY_LAYOUTS],
      ["process", TIMELINE_LAYOUTS],
      ["quote", FORM_LAYOUTS],
      ["cta", CTA_SYSTEMS],
      ["content", SECTION_COMPOSITIONS],
    ] as const;
    const supported = /^(hero-(split|layered|editorial|focus)|cards-(floating|editorial|clean|elevated)|proof-(feature|editorial|grid|cards)|gallery-(mosaic|cinematic|editorial|grid)|pricing-(matrix|cards|feature|rows)|stats-(statement|band|editorial|grid)|process-(rail|story|phases|steps)|faq-(compact|editorial|spacious|clean)|form-(glass|editorial|premium|clean)|cta-(fullbleed|spotlight|panel|minimal)|section-(editorial|airy|soft|balanced))$/;
    for (const [kind, pool] of pools) {
      for (const choice of pool) expect(rendererVariant(kind, choice)).toMatch(supported);
    }
  });
});
