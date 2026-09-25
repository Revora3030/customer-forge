/**
 * SITE-WIDE SAFETY & TRUTH STANDARD
 * =================================
 *
 * The non-creative bar every AI-authored site must satisfy. It deliberately
 * contains NO aesthetic rule: no hero or visual counts, no call-to-action
 * counts, no accent limits, no required "editorial moments", no card-stack
 * bans and no forced variation between pages. Those are creative decisions
 * and belong entirely to the AI team.
 *
 * What remains is truth, accessibility and device coverage — rules that can
 * reject unsafe output but never choose a design.
 *
 * Pure module: no environment, network, provider or template dependency.
 */

export const CREATIVE_QUALITY_MATRIX_VERSION = 2 as const;

export type CreativeQualityMatrix = {
  version: typeof CREATIVE_QUALITY_MATRIX_VERSION;
  truth: {
    copiedBrandingAllowed: false;
    generatedMediaAsProofAllowed: false;
    unsupportedUrgencyAllowed: false;
  };
  accessibility: {
    readableBodyMeasureRequired: true;
  };
  /** Widths the visual QA renders and inspects; not a layout instruction. */
  responsiveWidths: readonly number[];
};

export const SITE_WIDE_CREATIVE_QUALITY_MATRIX: CreativeQualityMatrix = {
  version: CREATIVE_QUALITY_MATRIX_VERSION,
  truth: {
    copiedBrandingAllowed: false,
    generatedMediaAsProofAllowed: false,
    unsupportedUrgencyAllowed: false,
  },
  accessibility: { readableBodyMeasureRequired: true },
  responsiveWidths: [320, 375, 390, 430, 768, 1024, 1280, 1440],
};

/**
 * Prompt text for the non-negotiable rules only. It gives the AI no
 * aesthetic direction: the design, structure and style are its own call.
 */
export function creativeQualityPrompt(_matrix = SITE_WIDE_CREATIVE_QUALITY_MATRIX): string {
  return [
    "NON-NEGOTIABLE RULES (safety and truth only — every creative choice is yours):",
    "Do not copy another brand's identity.",
    "Generated visuals must never pose as real reviews, completed work, staff, awards or results.",
    "Do not invent urgency, scarcity or claims the business has not supplied.",
    "Body text must stay readable and meet WCAG contrast; design must work from 320px phones to wide desktops.",
  ].join(" ");
}
