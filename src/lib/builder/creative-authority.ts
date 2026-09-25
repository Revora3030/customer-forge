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

import type { CreativeBrief } from "@/lib/builder/first-build-contract";
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
  /** The AI's own per-width behaviour, when it described one. */
  responsive?: Partial<Record<number, Partial<ResponsiveBehaviour>>>;
  sections: { role: string; layout?: string; intent?: string; media?: SectionDesign["media"]; heading?: string | null; subheading?: string | null; body?: string | null; custom?: boolean; includes?: ("primary_action" | "service_cards")[] }[];
};

/**
 * Records the AI's own per-width behaviour. Nothing is derived: widths the AI
 * did not describe keep the AI's authored section order and carry no invented
 * column count, nav style, CTA placement, crop or type scale. Actual responsive
 * styling lives on the AI's composition nodes (node.responsive).
 */
function responsivePlan(input: {
  sections: SectionDesign[];
  authored?: Partial<Record<number, Partial<ResponsiveBehaviour>>>;
}): Record<number, ResponsiveBehaviour> {
  const authoredOrder = input.sections.map((section) => section.id);
  const plan: Record<number, ResponsiveBehaviour> = {};
  for (const width of REQUIRED_RESPONSIVE_WIDTHS) {
    const own = input.authored?.[width] ?? {};
    plan[width] = { ...own, order: own.order ?? authoredOrder };
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
      // The AI names the layout. When it did not, the role is recorded as-is —
      // no style is chosen on its behalf.
      layout: section.layout ?? section.role,
      intent: section.intent ?? page.purpose,
      media: section.media ?? "none",
      emphasis: index + 1,
    }));
    return {
      slug: page.slug,
      title: page.title,
      purpose: page.purpose,
      sections,
      primaryAction: page.primaryAction,
      responsive: responsivePlan({ sections, authored: page.responsive }),
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
      differentiators: input.differentiators ?? input.brief.industryConventions,
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
      placement: input.architecture.flatMap((page) =>
        page.sections.filter((section) => section.includes?.includes("primary_action")).map((section) => `${page.slug}:${section.role}`),
      ),
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
    qualityMatrix: input.brief.qualityMatrix,
    pages,
  };
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
      `The AI's website design did not pass validation (${result.violations.map((item) => `${item.path}: ${item.detail}`).join("; ")}), and Revora does not fall back to a stock template. The build stopped so the design can be repaired and retried.`,
      result.violations,
      input.attempts,
    );
  return input.attempt;
}
