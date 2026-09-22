/**
 * CREATIVE AUTHORITY — WHO IS ALLOWED TO DESIGN THE WEBSITE.
 *
 * Exactly one answer: the AI. This module compiles the AI-owned design
 * specification (fingerprint + reviewed creative brief + page architecture) into
 * the canonical AI design contract, and refuses every other route to a design.
 *
 * The fingerprint is treated as a DESIGN SPECIFICATION, not a template id: its
 * values are read as the AI's stated choices (hero composition, colour system,
 * motion, art direction) and written into the contract as explicit design
 * decisions. Nothing here resolves to "use template X", and there is no
 * deterministic design to fall back to: when the AI cannot produce a usable
 * design, the build fails loudly and asks for another attempt.
 *
 * Pure module: no environment, no network, no secrets.
 */

import type { CreativeBrief } from "@/lib/builder/creative-brief";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
import {
  CREATIVE_AUTHORITY,
  REQUIRED_RESPONSIVE_WIDTHS,
  validateAiDesignContract,
  type AiDesignContract,
  type ContractViolation,
  type PageDesign,
  type ResponsiveBehaviour,
  type SectionDesign,
} from "@/lib/builder/ai-design-contract";

export class CreativeAuthorityError extends Error {
  readonly violations: ContractViolation[];
  readonly attempts: number;
  constructor(message: string, violations: ContractViolation[], attempts: number) {
    super(message);
    this.name = "CreativeAuthorityError";
    this.violations = violations;
    this.attempts = attempts;
  }
}

/** One page's architecture as the AI decided it. */
export type PageArchitecture = {
  slug: string;
  title: string;
  purpose: string;
  primaryAction: string;
  /** Section roles in the AI's intended order for this page. */
  sections: { role: string; layout?: string; intent?: string; media?: SectionDesign["media"] }[];
};

function responsivePlan(input: {
  sections: SectionDesign[];
  mobileStrategy: string[];
  navSystem: string;
  ctaSystem: string;
  crop: string;
}): Record<number, ResponsiveBehaviour> {
  // Mobile order is an intentional hierarchy decision, taken from the design's
  // own emphasis ranking rather than from the desktop order.
  const mobileOrder = [...input.sections]
    .sort((a, b) => a.emphasis - b.emphasis)
    .map((section) => section.id);
  const desktopOrder = input.sections.map((section) => section.id);
  const stickyCta = /sticky|persistent|bar/i.test(input.ctaSystem);
  const plan: Record<number, ResponsiveBehaviour> = {};
  for (const width of REQUIRED_RESPONSIVE_WIDTHS) {
    const phone = width < 500;
    const tablet = width >= 500 && width < 1100;
    plan[width] = {
      order: phone ? mobileOrder : desktopOrder,
      typeScale: width <= 375 ? 0.84 : phone ? 0.9 : tablet ? 0.96 : 1,
      cta: phone ? (stickyCta ? "sticky_bar" : "stacked") : "inline",
      columns: phone ? 1 : tablet ? 2 : 3,
      imageCrop: phone
        ? input.crop === "21:9"
          ? "landscape"
          : "portrait"
        : tablet
          ? "landscape"
          : "wide",
      nav: phone ? "drawer" : tablet ? "condensed" : "full",
    };
  }
  return plan;
}

/**
 * Compiles the AI's creative decisions into the canonical contract. The page
 * architecture argument is the AI's own page plan; this function does not invent
 * one, and refuses to produce a contract without it.
 */
export function compileAiDesignContract(input: {
  businessName: string;
  fingerprint: DesignFingerprint;
  brief: CreativeBrief;
  architecture: PageArchitecture[];
  directedBy: string;
  reviewedBy?: string | null;
  conversionGoal: string;
  navigationItems: string[];
  primaryAction: string;
  secondaryAction?: string | null;
  differentiators?: string[];
}): AiDesignContract {
  const pages: PageDesign[] = input.architecture.map((page) => {
    const sections: SectionDesign[] = page.sections.map((section, index) => ({
      id: `${page.slug.replace(/[^a-z0-9]+/gi, "-")}-${section.role}-${index}`,
      role: section.role,
      layout: section.layout ?? sectionLayoutFor(section.role, input.fingerprint),
      intent: section.intent ?? `${section.role} advances ${page.purpose}`,
      media: section.media ?? mediaNeedFor(section.role),
      emphasis: index + 1,
    }));
    return {
      slug: page.slug,
      title: page.title,
      purpose: page.purpose,
      sections,
      primaryAction: page.primaryAction,
      responsive: responsivePlan({
        sections,
        mobileStrategy: input.brief.mobileStrategy,
        navSystem: input.fingerprint.navSystem,
        ctaSystem: input.fingerprint.ctaSystem,
        crop: input.fingerprint.artDirection.aspectRatio,
      }),
    };
  });

  return {
    authority: CREATIVE_AUTHORITY,
    directedBy: input.directedBy,
    reviewedBy: input.reviewedBy ?? null,
    identity: {
      name: input.businessName,
      concept: `${input.brief.archetype} — ${input.fingerprint.family}`,
      personality: input.brief.personality,
      differentiators: input.differentiators ?? input.brief.industryConventions.slice(0, 4),
    },
    typography: {
      display: input.brief.typography.display,
      body: input.brief.typography.body,
      scaleRatio: input.brief.typography.scaleRatio,
      headlineCase: input.brief.typography.headlineCase,
      headlineWeight: input.brief.typography.headlineWeight,
      measureCh: input.brief.typography.measureCh,
    },
    color: {
      background: input.brief.color.system,
      surface: input.fingerprint.backgroundSystem,
      text: input.brief.color.accentUse,
      accent: input.fingerprint.colorSystem,
      extras: {},
      mode:
        input.brief.color.strategy === "dark-dominant"
          ? "dark"
          : input.brief.color.strategy === "duotone"
            ? "duotone"
            : "light",
    },
    backgrounds: [input.fingerprint.backgroundSystem, input.brief.backgroundTreatment],
    spacing: {
      baseline: 8,
      sectionRhythm: input.fingerprint.density === "compact" ? [48, 64, 80] : [72, 96, 128],
      density:
        input.fingerprint.density === "compact"
          ? "tight"
          : input.fingerprint.density === "airy"
            ? "airy"
            : "balanced",
    },
    grid: {
      container: 1200,
      columns: 12,
      gutter: 24,
      behaviour: input.fingerprint.pageShell,
    },
    navigation: {
      structure: input.fingerprint.navSystem,
      items: input.navigationItems,
      behaviour: input.brief.mobileStrategy[0] ?? "drawer on phones, full bar on desktop",
    },
    hero: {
      composition: input.fingerprint.heroComposition,
      mediaTreatment: input.fingerprint.imageTreatment,
      intent: input.brief.conversionStrategy[0] ?? input.conversionGoal,
    },
    cta: {
      system: input.fingerprint.ctaSystem,
      primary: input.primaryAction,
      secondary: input.secondaryAction ?? null,
      placement: ["hero", "mid-page", "closing"],
    },
    cards: { style: input.fingerprint.cardSystem, mediaRatio: input.fingerprint.artDirection.aspectRatio },
    forms: { layout: input.fingerprint.formLayout, fields: ["name", "contact", "need"] },
    imagery: {
      artDirection: `${input.brief.photography.language}; ${input.brief.photography.lighting}`,
      treatment: input.fingerprint.imageTreatment,
      slots: input.brief.imageInventory.map((entry) => entry.slot),
    },
    motion: { pattern: input.fingerprint.motionPattern, intensity: input.fingerprint.motionLevel },
    accessibility: {
      minContrast: Math.max(4.5, input.brief.color.minBodyContrast),
      minTouchTargetPx: 44,
      reducedMotionSafe: true,
    },
    conversion: { goal: input.conversionGoal, steps: input.brief.conversionStrategy },
    pages,
  };
}

function sectionLayoutFor(role: string, fingerprint: DesignFingerprint): string {
  switch (role) {
    case "hero":
      return fingerprint.heroComposition;
    case "services":
      return fingerprint.cardSystem;
    case "proof":
    case "testimonials":
      return fingerprint.proofLayout;
    case "pricing":
      return fingerprint.pricingLayout;
    case "faq":
      return fingerprint.faqLayout;
    case "gallery":
      return fingerprint.galleryLayout;
    case "stats":
      return fingerprint.statsLayout;
    case "quote":
    case "contact":
      return fingerprint.formLayout;
    default:
      return fingerprint.sectionRhythm;
  }
}

function mediaNeedFor(role: string): SectionDesign["media"] {
  if (role === "hero" || role === "gallery" || role === "feature_media") return "required";
  if (role === "services" || role === "cta" || role === "intro") return "optional";
  return "none";
}

/**
 * The only way a build may obtain a design.
 *
 * `attempt` is the AI's produced contract for this try. A missing or invalid
 * contract is a build failure with the violations attached, so the caller can
 * retry with another specialist or ask Terra for a repair plan. There is
 * deliberately no deterministic design to return instead.
 */
export function requireAiDesignContract(input: {
  attempt: AiDesignContract | null;
  attempts: number;
}): AiDesignContract {
  if (!input.attempt)
    throw new CreativeAuthorityError(
      "The AI did not return a website design, and Revora does not fall back to a stock template. The build stopped so it can be retried with another specialist model.",
      [{ path: "contract", detail: "no AI design contract was produced", severity: "blocker" }],
      input.attempts,
    );
  const result = validateAiDesignContract(input.attempt);
  if (!result.valid)
    throw new CreativeAuthorityError(
      "The AI's website design did not pass validation, and Revora does not fall back to a stock template. The build stopped so the design can be repaired and retried.",
      result.violations,
      input.attempts,
    );
  return input.attempt;
}
