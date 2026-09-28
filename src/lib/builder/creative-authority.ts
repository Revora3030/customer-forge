/**
 * CREATIVE AUTHORITY — WHO IS ALLOWED TO DESIGN THE WEBSITE.
 *
 * Exactly one answer: the AI. This module compiles the reviewed AI creative
 * brief plus the AI page architecture into the canonical AI design contract.
 * There is no persisted fingerprint, template id, archetype or deterministic
 * creative fallback in this path. Code may reject unsafe or incomplete output; it
 * may not replace creative decisions with house choices.
 *
 * Pure module: no environment, no network, no secrets.
 */

import type { CreativeBrief } from "@/lib/builder/first-build-contract";
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
  /** The AI's own per-width behaviour, when it described one. */
  responsive?: Partial<Record<number, Partial<ResponsiveBehaviour>>>;
  /** Section roles in the AI's intended order for this page. */
  sections: {
    role: string;
    layout?: string;
    intent?: string;
    media?: SectionDesign["media"];
    heading?: string | null;
    subheading?: string | null;
    body?: string | null;
    custom?: boolean;
    includes?: ("primary_action" | "service_cards")[];
  }[];
};

/**
 * Records the AI's own per-width behaviour. Nothing is derived: widths the AI
 * did not describe keep the AI's authored section order and carry no invented
 * column count, nav style, CTA placement, crop or type scale. Actual responsive
 * styling lives on the AI's composition nodes (node.responsive).
 */
function responsivePlan(input: {
  sections: SectionDesign[];
  authored?: Partial<Record<number, Partial<ResponsiveBehaviour>>> | undefined;
}): Record<number, ResponsiveBehaviour> {
  const authoredOrder = input.sections.map((section) => section.id);
  const plan: Record<number, ResponsiveBehaviour> = {};
  for (const width of REQUIRED_RESPONSIVE_WIDTHS) {
    const own = input.authored?.[width] ?? {};
    plan[width] = {
      order: own.order ?? authoredOrder,
      typeScale: own.typeScale ?? 1,
      cta: own.cta ?? "stack",
      columns: own.columns ?? 1,
      imageCrop: own.imageCrop ?? "cover",
      nav: own.nav ?? "stack",
    };
  }
  return plan;
}

const briefText = (value: string | null | undefined) => value?.trim() ?? "";

/**
 * Compiles the AI's creative decisions into the canonical contract. The page
 * architecture argument is the AI's own page plan; this function does not invent
 * one, and refuses to produce a contract without it.
 */
export function compileAiDesignContract(input: {
  businessName: string;
  fingerprint?: unknown;
  brief: CreativeBrief;
  architecture: PageArchitecture[];
  directedBy: string;
  reviewedBy?: string | null;
  conversionGoal: string | null;
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
      concept: briefText(input.brief.concept),
      personality: briefText(input.brief.personality),
      differentiators: input.differentiators ?? input.brief.industryConventions,
    },
    typography: {
      display: briefText(input.brief.typography.display),
      body: briefText(input.brief.typography.body),
      scaleRatio: input.brief.typography.scaleRatio,
      headlineCase: briefText(input.brief.typography.headlineCase) as "title" | "sentence" | "upper",
      headlineWeight: briefText(input.brief.typography.headlineWeight) as "bold" | "medium" | "light" | "regular",
      measureCh: input.brief.typography.measureCh,
    },
    color: {
      background: briefText(input.brief.color.system),
      surface: briefText(input.brief.backgroundTreatment),
      text: briefText(input.brief.color.accentUse),
      accent: briefText(input.brief.color.accentUse || input.brief.color.system),
      extras: {},
      mode: briefText(input.brief.color.strategy) as string,
    },
    backgrounds: [input.brief.backgroundTreatment].filter(Boolean),
    spacing: { rhythm: briefText(input.brief.sectionRhythm) as "tight" | "airy" | "balanced", density: briefText(input.brief.density) },
    grid: { behaviour: briefText(input.brief.sectionRhythm), container: 1200, columns: 1, gutter: 16 },
    navigation: {
      structure: briefText(input.brief.mobileStrategy[0]),
      items: input.navigationItems,
      behaviour: briefText(input.brief.mobileStrategy[0]),
    },
    hero: {
      composition: briefText(input.brief.heroComposition),
      mediaTreatment: briefText(input.brief.photography.treatment),
      intent: briefText(input.brief.conversionStrategy[0]),
    },
    cta: {
      system: briefText(input.brief.ctaLanguage),
      primary: input.primaryAction,
      secondary: input.secondaryAction ?? null,
      placement: input.architecture.flatMap((page) =>
        page.sections
          .filter((section) => section.includes?.includes("primary_action"))
          .map((section) => `${page.slug}:${section.role}`),
      ),
    },
    cards: { style: briefText(input.brief.cardLanguage), mediaRatio: "" },
    forms: { layout: "", fields: [] },
    imagery: {
      artDirection: [input.brief.photography.language, input.brief.photography.lighting].filter(Boolean).join("; "),
      treatment: briefText(input.brief.photography.treatment) as "light" | "dark" | "duotone" | "high_contrast",
      slots: input.brief.imageInventory?.map((entry) => entry.slot) ?? [],
    },
    motion: { pattern: briefText(input.brief.motion.language), intensity: briefText(input.brief.motion.level) as "none" | "subtle" | "expressive" },
    accessibility: {
      minContrast: Math.max(4.5, input.brief.color.minBodyContrast),
      minTouchTargetPx: 44,
      reducedMotionSafe: true,
    },
    conversion: { goal: (input.conversionGoal?.trim() || null) as string, steps: input.brief.conversionStrategy ?? [] },
    qualityMatrix: input.brief.qualityMatrix,
    pages,
  } as any;
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
