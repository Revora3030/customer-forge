import {
  type GeneratedSiteQualityResult,
  type QualityEvidence,
  evaluateGeneratedSiteQuality,
  recommendGeneratedSiteQualityImprovements,
} from "./generated-site-quality";

export interface GeneratedSiteQualitySignals {
  brandProfileResolved: boolean;
  heroHasSpecificOfferAndCta: boolean;
  primaryConversionRouteWorks: boolean;
  verifiedFactsAndTrustProof: boolean;
  specificNonPlaceholderContent: boolean;
  consistentTokensAndComposition: boolean;
  responsiveChecksPass: boolean;
  accessibilityChecksPass: boolean;
  performanceChecksPass: boolean;
  assetAndFactProvenanceComplete: boolean;
  blockedReasons?: string[];
}

export interface GeneratedSiteQualityAssessment {
  evidence: QualityEvidence;
  result: GeneratedSiteQualityResult;
  recommendations: ReturnType<typeof recommendGeneratedSiteQualityImprovements>;
}

export function evidenceFromGeneratedSiteSignals(
  signals: GeneratedSiteQualitySignals,
): QualityEvidence {
  return {
    brandFit: signals.brandProfileResolved,
    firstScreenClarity: signals.heroHasSpecificOfferAndCta,
    conversionPath: signals.primaryConversionRouteWorks,
    trustAndFacts: signals.verifiedFactsAndTrustProof,
    contentSpecificity: signals.specificNonPlaceholderContent,
    visualCraft: signals.consistentTokensAndComposition,
    responsiveUx: signals.responsiveChecksPass,
    accessibility: signals.accessibilityChecksPass,
    performance: signals.performanceChecksPass,
    editingSafety: signals.assetAndFactProvenanceComplete,
  };
}

export function assessGeneratedSiteQuality(
  signals: GeneratedSiteQualitySignals,
): GeneratedSiteQualityAssessment {
  const evidence = evidenceFromGeneratedSiteSignals(signals);
  const result = evaluateGeneratedSiteQuality({
    evidence,
    ...(signals.blockedReasons !== undefined ? { blockedReasons: signals.blockedReasons } : {}),
  });
  return {
    evidence,
    result,
    recommendations: recommendGeneratedSiteQualityImprovements(result),
  };
}
