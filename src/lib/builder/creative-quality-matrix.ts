/**
 * SITE-WIDE CREATIVE QUALITY MATRIX
 * =================================
 *
 * This is the quality bar the AI team must satisfy on every first build. It is
 * distilled from reference work, but deliberately contains no copied brand,
 * wording, colour value or layout coordinate. The matrix describes qualities;
 * Sol still creates a unique, industry-appropriate identity for each business.
 *
 * Pure module: no environment, network, provider or template dependency.
 */

export const CREATIVE_QUALITY_MATRIX_VERSION = 1 as const;

export type CreativeQualityMatrix = {
  version: typeof CREATIVE_QUALITY_MATRIX_VERSION;
  standard: "reference_grade";
  creativeLead: "sol";
  adversarialReviewer: "terra";
  metadataOwner: "luna";
  heroImageOwner: "sunburst";
  supportingImageOwner: "flare";
  principles: string[];
  identity: {
    industryAdaptive: true;
    copiedBrandingAllowed: false;
    oneRecognisableConcept: true;
    restrainedAccentRoles: number;
  };
  typography: {
    deliberateDisplayBodyContrast: true;
    editorialMomentRequired: true;
    readableBodyMeasureRequired: true;
  };
  imagery: {
    cinematicHeroRequired: true;
    importantPageVisualRequired: true;
    serviceSpecificVisualsRequired: true;
    emptyVisualsAllowed: false;
    generatedMediaAsProofAllowed: false;
    minimumDistinctVisuals: number;
  };
  composition: {
    deliberateOpeningRequired: true;
    usefulBodyRequired: true;
    closingActionRequired: true;
    crossPageVariationRequired: true;
    nestedCardStacksAllowed: false;
  };
  conversion: {
    primaryActionPerPageRequired: true;
    persistentMobileActionWhenAppropriate: true;
    unsupportedUrgencyAllowed: false;
  };
  responsiveWidths: readonly number[];
};

export const SITE_WIDE_CREATIVE_QUALITY_MATRIX: CreativeQualityMatrix = {
  version: CREATIVE_QUALITY_MATRIX_VERSION,
  standard: "reference_grade",
  creativeLead: "sol",
  adversarialReviewer: "terra",
  metadataOwner: "luna",
  heroImageOwner: "sunburst",
  supportingImageOwner: "flare",
  principles: [
    "One distinct visual concept governs the full site without making every page identical.",
    "Photography is composed with intentional focal points, negative space and mobile crops.",
    "Typography creates editorial hierarchy while body copy stays highly readable.",
    "Accent colour is reserved for actions, navigation cues and a small number of emphasis moments.",
    "Every page tells its own conversion story through an opening, useful body and decisive close.",
    "Generated marketing visuals never impersonate reviews, completed work, staff, awards or results.",
  ],
  identity: {
    industryAdaptive: true,
    copiedBrandingAllowed: false,
    oneRecognisableConcept: true,
    restrainedAccentRoles: 3,
  },
  typography: {
    deliberateDisplayBodyContrast: true,
    editorialMomentRequired: true,
    readableBodyMeasureRequired: true,
  },
  imagery: {
    cinematicHeroRequired: true,
    importantPageVisualRequired: true,
    serviceSpecificVisualsRequired: true,
    emptyVisualsAllowed: false,
    generatedMediaAsProofAllowed: false,
    minimumDistinctVisuals: 3,
  },
  composition: {
    deliberateOpeningRequired: true,
    usefulBodyRequired: true,
    closingActionRequired: true,
    crossPageVariationRequired: true,
    nestedCardStacksAllowed: false,
  },
  conversion: {
    primaryActionPerPageRequired: true,
    persistentMobileActionWhenAppropriate: true,
    unsupportedUrgencyAllowed: false,
  },
  responsiveWidths: [320, 375, 390, 430, 768, 1024, 1280, 1440],
};

/** A compact provider prompt; the full typed matrix remains the acceptance gate. */
export function creativeQualityPrompt(matrix = SITE_WIDE_CREATIVE_QUALITY_MATRIX): string {
  return [
    `QUALITY STANDARD: ${matrix.standard}.`,
    ...matrix.principles,
    "Adapt the aesthetic to this business and industry; do not copy the reference brand or force an automotive look.",
    "Treat every page as designed work, not as a home-page style repeated around generic content.",
  ].join(" ");
}