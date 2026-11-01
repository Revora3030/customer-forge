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

import type { CreativeBrief, ImageBriefSpec } from "@/lib/builder/first-build-contract";
import type { OwnerStyleChoice } from "@/lib/builder/style-picks";
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
  /** The architect's own search title for this page (<= 60 characters). */
  seoTitle?: string | null;
  /** The architect's own page-specific search description (120-155 characters). */
  seoDescription?: string | null;
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
    includes?: ("primary_action" | "service_cards" | "faqs" | "benefits")[];
  }[];
};

/**
 * One picture of the AI campaign, optionally tied to the real service it
 * illustrates. The collective writes `serviceName` (exactly a supplied service
 * name) so service cards get their picture by service, not by a guessed label.
 */
export type ServiceAwareImageSpec = ImageBriefSpec & { serviceName?: string | null };

/** The service name the campaign tied to a picture, when it named one. */
export function imageSpecServiceName(spec: ImageBriefSpec): string | null {
  const value = (spec as ServiceAwareImageSpec).serviceName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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
    plan[width] = { ...own, order: own.order ?? authoredOrder };
  }
  return plan;
}

const briefText = (value: string | null | undefined) => value?.trim() ?? "";

/**
 * Recover only the missing one-line concept from signals already authored in
 * the brief. This is not a template selector and never invents business claims.
 * It prevents a transient model timeout from turning an otherwise complete
 * design into a hard validation failure.
 */
export function recoverVisualConcept(brief: CreativeBrief): string {
  const authoredSignals = [
    brief.photography.language,
    brief.photography.treatment,
    brief.backgroundTreatment,
    brief.sectionRhythm,
    brief.density,
    brief.conversionStrategy[0],
  ].map(briefText).filter(Boolean).slice(0, 3);
  if (authoredSignals.length) {
    return "A distinct, responsive visual direction shaped by " + authoredSignals.join("; ") + ".";
  }
  return "A clear, accessible, responsive visual experience centered on the verified business information and the visitor next action.";
}

/**
 * Compiles the AI's creative decisions into the canonical contract. The page
 * architecture argument is the AI's own page plan; this function does not invent
 * one, and refuses to produce a contract without it.
 */
export function compileAiDesignContract(input: {
  businessName: string;
  brief: CreativeBrief;
  architecture: PageArchitecture[];
  directedBy: string;
  reviewedBy?: string | null;
  conversionGoal: string | null;
  navigationItems: string[];
  primaryAction: string;
  secondaryAction?: string | null;
  differentiators?: string[];
  /** The look the owner picked in the wizard. Their fonts and colours win over the AI's; the feel is recorded for the design team. */
  ownerStyle?: OwnerStyleChoice | null;
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

  const owner = input.ownerStyle ?? null;
  return {
    authority: CREATIVE_AUTHORITY,
    ...(owner ? { ownerStyle: { id: owner.id, name: owner.name, feel: owner.feel } } : {}),
    directedBy: input.directedBy,
    reviewedBy: input.reviewedBy ?? null,
    identity: {
      name: input.businessName,
      concept: briefText(input.brief.concept) || recoverVisualConcept(input.brief),
      personality: owner
        ? [briefText(input.brief.personality), `owner-chosen look "${owner.name}": ${owner.feel}`].filter(Boolean).join("; ")
        : briefText(input.brief.personality),
      differentiators: input.differentiators ?? input.brief.industryConventions,
    },
    typography: {
      display: owner ? owner.display : briefText(input.brief.typography.display),
      body: owner ? owner.body : briefText(input.brief.typography.body),
      scaleRatio: input.brief.typography.scaleRatio,
      headlineCase: briefText(input.brief.typography.headlineCase),
      headlineWeight: briefText(input.brief.typography.headlineWeight),
      measureCh: input.brief.typography.measureCh,
    },
    color: {
      background: owner ? owner.palette.secondary : briefText(input.brief.color.system),
      surface: briefText(input.brief.backgroundTreatment),
      text: briefText(input.brief.color.accentUse),
      accent: owner ? owner.palette.primary : briefText(input.brief.color.accentUse || input.brief.color.system),
      extras: owner ? { structural: owner.palette.accent } : {},
      mode: briefText(input.brief.color.strategy),
    },
    backgrounds: [input.brief.backgroundTreatment].filter(Boolean),
    spacing: { rhythm: briefText(input.brief.sectionRhythm), density: briefText(input.brief.density) },
    grid: { behaviour: briefText(input.brief.sectionRhythm) },
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
      treatment: briefText(input.brief.photography.treatment),
      slots: input.brief.imageInventory.map((entry) => entry.slot),
    },
    motion: { pattern: briefText(input.brief.motion.language), intensity: briefText(input.brief.motion.level) },
    accessibility: {
      minContrast: Math.max(4.5, input.brief.color.minBodyContrast),
      minTouchTargetPx: 44,
      reducedMotionSafe: true,
    },
    conversion: { goal: input.conversionGoal?.trim() || null, steps: input.brief.conversionStrategy },
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
