/**
 * REVORA VISUAL INTELLIGENCE ENGINE
 * =================================
 *
 * Free-first visual art direction engine.
 *
 * This is NOT an image generator and does not require an AI API.
 * It decides:
 * - composition
 * - visual hierarchy
 * - image treatment
 * - image ratio
 * - typography scale
 * - spacing rhythm
 * - card geometry
 * - overlay treatment
 * - motion intensity
 * - responsive behavior
 *
 * The engine is intentionally deterministic.
 *
 * Inspired by the capabilities users now expect from leading visual AI
 * builders, while remaining native to Revora and provider-independent.
 */

import type { IndustryPlaybook } from "./industry";
import type { StyleMood } from "./interpreter";
import type { BackdropId, SectionEffectId } from "@/lib/site-effects";

export type VisualArchetype =
  | "cinematic"
  | "editorial"
  | "luxury"
  | "clean"
  | "bold"
  | "organic"
  | "technical"
  | "playful"
  | "local-premium"
  | "conversion";

export type HeroComposition =
  | "split"
  | "centered"
  | "image_right"
  | "image_left"
  | "full_bleed"
  | "editorial"
  | "layered"
  | "minimal";

export type ImageTreatment =
  | "natural"
  | "rounded"
  | "soft_shadow"
  | "glass_frame"
  | "duotone"
  | "gradient_overlay"
  | "cinematic"
  | "cutout"
  | "full_bleed";

export type CardGeometry =
  | "soft"
  | "sharp"
  | "pill"
  | "glass"
  | "editorial"
  | "floating";

export type SectionDensity =
  | "airy"
  | "balanced"
  | "dense";

export type MotionIntensity = 0 | 1 | 2 | 3;

export type ResponsiveStrategy =
  | "stack"
  | "preserve_split"
  | "image_first"
  | "text_first"
  | "center_mobile"
  | "compact_mobile";

export type VisualSystem = {
  archetype: VisualArchetype;

  hero: {
    composition: HeroComposition;
    imageTreatment: ImageTreatment;
    overlay: "none" | "soft" | "dark" | "brand" | "gradient";
    focalPosition: "left" | "center" | "right";
    height: "compact" | "standard" | "cinematic";
  };

  typography: {
    headingScale: "tight" | "standard" | "display";
    bodyScale: "compact" | "standard" | "comfortable";
    headingWeight: "medium" | "semibold" | "bold";
    uppercaseLabels: boolean;
  };

  layout: {
    density: SectionDensity;
    maxWidth: "narrow" | "standard" | "wide" | "edge";
    radius: "small" | "medium" | "large" | "mixed";
    cards: CardGeometry;
    sectionAlternation: boolean;
  };

  media: {
    preferredRatio: "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
    galleryColumns: 2 | 3 | 4;
    useHeroImage: boolean;
    useSectionImages: boolean;
    useDecorativeVisuals: boolean;
    imageTreatment: ImageTreatment;
  };

  motion: {
    intensity: MotionIntensity;
    heroEffect: SectionEffectId;
    bodyEffect: SectionEffectId;
    hoverDepth: boolean;
    parallax: boolean;
  };

  backdrop: BackdropId;

  responsive: {
    mobile: ResponsiveStrategy;
    tablet: ResponsiveStrategy;
    preserveImageHierarchy: boolean;
  };

  score: {
    conversion: number;
    visual: number;
    trust: number;
    readability: number;
    performance: number;
  };

  rationale: string[];
};

type Facts = {
  name?: string | null;
  industry?: string | null;
  description?: string | null;
  city?: string | null;
  serviceArea?: string | null;
};

function text(...values: unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function hash(input: string): number {
  let h = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  if (!items.length) throw new Error("visual-intelligence-empty-choice");
  return items[hash(seed) % items.length]!;
}

function hasAny(source: string, words: string[]) {
  return words.some((word) => source.includes(word));
}

function archetypeFor(
  facts: Facts,
  moods: StyleMood[],
): VisualArchetype {
  const source = text(
    facts.industry,
    facts.description,
    facts.name,
  );

  if (moods.includes("premium")) {
    return "luxury";
  }

  if (
    hasAny(source, [
      "law",
      "attorney",
      "lawyer",
      "financial",
      "accounting",
      "insurance",
      "consulting",
    ])
  ) {
    return "editorial";
  }

  if (
    hasAny(source, [
      "restaurant",
      "food",
      "cafe",
      "bakery",
      "catering",
      "bar",
      "coffee",
    ])
  ) {
    return "cinematic";
  }

  if (
    hasAny(source, [
      "salon",
      "spa",
      "beauty",
      "barber",
      "fashion",
      "boutique",
      "wedding",
    ])
  ) {
    return "luxury";
  }

  if (
    hasAny(source, [
      "software",
      "technology",
      "saas",
      "ai ",
      "cyber",
      "engineering",
      "marketing",
    ])
  ) {
    return "technical";
  }

  if (
    hasAny(source, [
      "landscap",
      "garden",
      "florist",
      "outdoor",
      "cleaning",
      "pressure wash",
      "roof",
      "plumb",
      "electric",
      "contract",
      "construction",
    ])
  ) {
    return "local-premium";
  }

  if (moods.includes("bold")) return "bold";
  if (moods.includes("friendly")) return "organic";

  return "conversion";
}

function systemForArchetype(
  archetype: VisualArchetype,
  seed: string,
): VisualSystem {
  const defaults: Record<VisualArchetype, VisualSystem> = {
    cinematic: {
      archetype,
      hero: {
        composition: "full_bleed",
        imageTreatment: "cinematic",
        overlay: "gradient",
        focalPosition: "center",
        height: "cinematic",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "bold",
        uppercaseLabels: false,
      },
      layout: {
        density: "airy",
        maxWidth: "wide",
        radius: "medium",
        cards: "floating",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "16:9",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: true,
        imageTreatment: "cinematic",
      },
      motion: {
        intensity: 2,
        heroEffect: "parallax_slow",
        bodyEffect: "rise",
        hoverDepth: true,
        parallax: true,
      },
      backdrop: "spotlight",
      responsive: {
        mobile: "center_mobile",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 8,
        visual: 10,
        trust: 8,
        readability: 8,
        performance: 7,
      },
      rationale: [],
    },

    editorial: {
      archetype,
      hero: {
        composition: "editorial",
        imageTreatment: "natural",
        overlay: "none",
        focalPosition: "right",
        height: "standard",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "semibold",
        uppercaseLabels: true,
      },
      layout: {
        density: "airy",
        maxWidth: "narrow",
        radius: "small",
        cards: "editorial",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "3:2",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: false,
        imageTreatment: "natural",
      },
      motion: {
        intensity: 1,
        heroEffect: "rise",
        bodyEffect: "none",
        hoverDepth: false,
        parallax: false,
      },
      backdrop: "none",
      responsive: {
        mobile: "text_first",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 9,
        visual: 9,
        trust: 10,
        readability: 10,
        performance: 9,
      },
      rationale: [],
    },

    luxury: {
      archetype,
      hero: {
        composition: "layered",
        imageTreatment: "gradient_overlay",
        overlay: "dark",
        focalPosition: "center",
        height: "cinematic",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "medium",
        uppercaseLabels: true,
      },
      layout: {
        density: "airy",
        maxWidth: "wide",
        radius: "large",
        cards: "glass",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "4:3",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: true,
        imageTreatment: "gradient_overlay",
      },
      motion: {
        intensity: 2,
        heroEffect: "float_3d",
        bodyEffect: "rise",
        hoverDepth: true,
        parallax: true,
      },
      backdrop: "nebula",
      responsive: {
        mobile: "center_mobile",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 8,
        visual: 10,
        trust: 9,
        readability: 8,
        performance: 7,
      },
      rationale: [],
    },

    clean: {
      archetype,
      hero: {
        composition: "split",
        imageTreatment: "rounded",
        overlay: "none",
        focalPosition: "right",
        height: "standard",
      },
      typography: {
        headingScale: "standard",
        bodyScale: "standard",
        headingWeight: "semibold",
        uppercaseLabels: false,
      },
      layout: {
        density: "balanced",
        maxWidth: "standard",
        radius: "medium",
        cards: "soft",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "4:3",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: false,
        imageTreatment: "rounded",
      },
      motion: {
        intensity: 1,
        heroEffect: "rise",
        bodyEffect: "none",
        hoverDepth: true,
        parallax: false,
      },
      backdrop: "none",
      responsive: {
        mobile: "stack",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 9,
        visual: 8,
        trust: 9,
        readability: 10,
        performance: 10,
      },
      rationale: [],
    },

    bold: {
      archetype,
      hero: {
        composition: "centered",
        imageTreatment: "full_bleed",
        overlay: "brand",
        focalPosition: "center",
        height: "cinematic",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "bold",
        uppercaseLabels: true,
      },
      layout: {
        density: "airy",
        maxWidth: "wide",
        radius: "large",
        cards: "floating",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "16:9",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: true,
        imageTreatment: "full_bleed",
      },
      motion: {
        intensity: 3,
        heroEffect: "tilt_3d",
        bodyEffect: "rise",
        hoverDepth: true,
        parallax: true,
      },
      backdrop: "gradient_mesh",
      responsive: {
        mobile: "center_mobile",
        tablet: "stack",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 9,
        visual: 10,
        trust: 7,
        readability: 8,
        performance: 6,
      },
      rationale: [],
    },

    organic: {
      archetype,
      hero: {
        composition: "image_right",
        imageTreatment: "rounded",
        overlay: "soft",
        focalPosition: "right",
        height: "standard",
      },
      typography: {
        headingScale: "standard",
        bodyScale: "comfortable",
        headingWeight: "semibold",
        uppercaseLabels: false,
      },
      layout: {
        density: "airy",
        maxWidth: "wide",
        radius: "large",
        cards: "soft",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "4:3",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: true,
        imageTreatment: "rounded",
      },
      motion: {
        intensity: 1,
        heroEffect: "rise",
        bodyEffect: "none",
        hoverDepth: true,
        parallax: false,
      },
      backdrop: "aurora",
      responsive: {
        mobile: "stack",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 8,
        visual: 9,
        trust: 9,
        readability: 9,
        performance: 8,
      },
      rationale: [],
    },

    technical: {
      archetype,
      hero: {
        composition: "split",
        imageTreatment: "glass_frame",
        overlay: "none",
        focalPosition: "right",
        height: "standard",
      },
      typography: {
        headingScale: "display",
        bodyScale: "standard",
        headingWeight: "bold",
        uppercaseLabels: true,
      },
      layout: {
        density: "balanced",
        maxWidth: "wide",
        radius: "medium",
        cards: "glass",
        sectionAlternation: false,
      },
      media: {
        preferredRatio: "16:9",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: true,
        imageTreatment: "glass_frame",
      },
      motion: {
        intensity: 2,
        heroEffect: "tilt_3d",
        bodyEffect: "rise",
        hoverDepth: true,
        parallax: false,
      },
      backdrop: "grid",
      responsive: {
        mobile: "stack",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 9,
        visual: 9,
        trust: 8,
        readability: 8,
        performance: 8,
      },
      rationale: [],
    },

    playful: {
      archetype,
      hero: {
        composition: "centered",
        imageTreatment: "cutout",
        overlay: "none",
        focalPosition: "center",
        height: "standard",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "bold",
        uppercaseLabels: false,
      },
      layout: {
        density: "airy",
        maxWidth: "wide",
        radius: "large",
        cards: "floating",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "1:1",
        galleryColumns: 4,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: true,
        imageTreatment: "cutout",
      },
      motion: {
        intensity: 2,
        heroEffect: "float_3d",
        bodyEffect: "rise",
        hoverDepth: true,
        parallax: false,
      },
      backdrop: "aurora",
      responsive: {
        mobile: "center_mobile",
        tablet: "stack",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 8,
        visual: 10,
        trust: 7,
        readability: 8,
        performance: 7,
      },
      rationale: [],
    },

    "local-premium": {
      archetype,
      hero: {
        composition: "split",
        imageTreatment: "rounded",
        overlay: "soft",
        focalPosition: "right",
        height: "standard",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "bold",
        uppercaseLabels: false,
      },
      layout: {
        density: "airy",
        maxWidth: "wide",
        radius: "large",
        cards: "floating",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "4:3",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: false,
        imageTreatment: "rounded",
      },
      motion: {
        intensity: 1,
        heroEffect: "rise",
        bodyEffect: "rise",
        hoverDepth: true,
        parallax: false,
      },
      backdrop: "spotlight",
      responsive: {
        mobile: "stack",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 10,
        visual: 9,
        trust: 10,
        readability: 9,
        performance: 9,
      },
      rationale: [],
    },

    conversion: {
      archetype,
      hero: {
        composition: "split",
        imageTreatment: "soft_shadow",
        overlay: "none",
        focalPosition: "right",
        height: "standard",
      },
      typography: {
        headingScale: "display",
        bodyScale: "comfortable",
        headingWeight: "bold",
        uppercaseLabels: false,
      },
      layout: {
        density: "balanced",
        maxWidth: "wide",
        radius: "medium",
        cards: "soft",
        sectionAlternation: true,
      },
      media: {
        preferredRatio: "4:3",
        galleryColumns: 3,
        useHeroImage: true,
        useSectionImages: true,
        useDecorativeVisuals: false,
        imageTreatment: "soft_shadow",
      },
      motion: {
        intensity: 1,
        heroEffect: "rise",
        bodyEffect: "none",
        hoverDepth: true,
        parallax: false,
      },
      backdrop: "none",
      responsive: {
        mobile: "stack",
        tablet: "preserve_split",
        preserveImageHierarchy: true,
      },
      score: {
        conversion: 10,
        visual: 8,
        trust: 10,
        readability: 10,
        performance: 10,
      },
      rationale: [],
    },
  };

  const result = structuredClone(defaults[archetype]);

  /*
   * Deterministic micro-variation prevents every site from sharing exactly
   * the same composition while keeping the visual language coherent.
   */
  const variation = hash(seed);

  if (variation % 5 === 0 && result.hero.composition === "split") {
    result.hero.composition = "image_right";
  }

  if (variation % 7 === 0 && result.layout.cards === "soft") {
    result.layout.cards = "floating";
  }

  result.rationale.push(
    `Visual archetype: ${archetype}.`,
    "Composition, imagery, typography, spacing and motion were selected as one system.",
  );

  return result;
}

export function visualSystemFor(
  facts: Facts,
  playbook: IndustryPlaybook,
  moods: StyleMood[] = [],
  seedKey = "",
): VisualSystem {
  const seed = [
    seedKey,
    facts.name ?? "",
    facts.industry ?? "",
    facts.city ?? "",
    playbook.slug,
  ].join("|");

  const archetype = archetypeFor(facts, moods);
  const system = systemForArchetype(archetype, seed);

  /*
   * Industry is still the source of truth for brand colors/effects.
   * This engine owns composition, not business facts.
   */
  if (playbook.visual.backdrop) {
    system.backdrop = playbook.visual.backdrop as BackdropId;
  }

  return system;
}

export function visualSectionPlan(
  kind: string,
  system: VisualSystem,
) {
  const normalized = kind.toLowerCase();

  if (normalized === "hero") {
    return {
      variant: system.hero.composition,
      imageTreatment: system.hero.imageTreatment,
      effect: system.motion.heroEffect,
      priority: "critical" as const,
    };
  }

  if (normalized === "gallery") {
    return {
      variant: `${system.media.galleryColumns}-column`,
      imageTreatment: system.media.imageTreatment,
      effect: system.motion.bodyEffect,
      priority: "high" as const,
    };
  }

  if (
    normalized === "services" ||
    normalized === "benefits" ||
    normalized === "pricing"
  ) {
    return {
      variant: system.layout.cards,
      imageTreatment: "natural" as const,
      effect: system.motion.bodyEffect,
      priority: "high" as const,
    };
  }

  if (normalized === "cta" || normalized === "offer") {
    return {
      variant: system.layout.cards === "glass" ? "glass" : "focus",
      imageTreatment: "natural" as const,
      effect: "gold_glow" as SectionEffectId,
      priority: "critical" as const,
    };
  }

  return {
    variant: "default",
    imageTreatment: system.media.imageTreatment,
    effect: system.motion.bodyEffect,
    priority: "normal" as const,
  };
}

export function visualQualityScore(system: VisualSystem): number {
  const values = Object.values(system.score);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10);
}
