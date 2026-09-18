import type { ImprovementRecommendation } from './improvement-history';
import { evaluateEvidenceQuality, type MetricEvidence } from './outcome-evidence';

export type EvidenceLinkedRecommendation = ImprovementRecommendation & { linkedEvidence: MetricEvidence[] };

export type RecommendationDecision = {
  recommendation: EvidenceLinkedRecommendation;
  actionable: boolean;
  holdReasons: string[];
};

export function evaluateRecommendation(recommendation: EvidenceLinkedRecommendation, minimumSampleSize = 20): RecommendationDecision {
  if (recommendation.linkedEvidence.length === 0) return { recommendation, actionable: false, holdReasons: ['Link at least one credible metric-evidence record before reviewing this recommendation.'] };
  const holdReasons = recommendation.linkedEvidence.flatMap((evidence) => evaluateEvidenceQuality(evidence, minimumSampleSize).reasons);
  return { recommendation, actionable: holdReasons.length === 0, holdReasons: [...new Set(holdReasons)] };
}

export function splitRecommendations(recommendations: EvidenceLinkedRecommendation[], minimumSampleSize = 20) {
  const decisions = recommendations.map((recommendation) => evaluateRecommendation(recommendation, minimumSampleSize));
  return { actionable: decisions.filter((decision) => decision.actionable), held: decisions.filter((decision) => !decision.actionable) };
}
