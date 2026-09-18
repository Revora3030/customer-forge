import type { LaunchQualityInput } from './launch-quality-gate';

export type SiteReadinessSnapshot = {
  hasPrimaryCta: boolean;
  ctaRepeatedAtDecisionPoints: boolean;
  heroIncludesAudience: boolean;
  heroIncludesOutcome: boolean;
  hasDifferentiator: boolean;
  serviceCount: number;
  faqCount: number;
  hasProcess: boolean;
  visualDirectionSet: boolean;
  imageCount: number;
  mobileReviewed: boolean;
  tapTargetsChecked: boolean;
  headingOrderValid: boolean;
  contrastChecked: boolean;
  descriptiveControls: boolean;
  reducedMotionSafe: boolean;
  seoTitle: boolean;
  seoDescription: boolean;
  hasSingleH1: boolean;
  locationIntent: boolean;
  reviewCount: number;
  credentialCount: number;
  performanceBudgetPassed: boolean;
  imageOptimizationPassed: boolean;
  customDomainConnected: boolean;
  contactRouteVerified: boolean;
  analyticsConfigured: boolean;
  legalPagesPresent: boolean;
};

const yes = (value: boolean) => (value ? 100 : 0);
const countScore = (count: number, target: number) => Math.max(0, Math.min(100, Math.round((Math.max(0, count) / target) * 100)));
const average = (...scores: number[]) => Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);

export function launchQualityInputFromSnapshot(snapshot: SiteReadinessSnapshot): LaunchQualityInput {
  return {
    conversion: average(yes(snapshot.hasPrimaryCta), yes(snapshot.ctaRepeatedAtDecisionPoints)),
    messaging: average(yes(snapshot.heroIncludesAudience), yes(snapshot.heroIncludesOutcome), yes(snapshot.hasDifferentiator)),
    content: average(countScore(snapshot.serviceCount, 3), countScore(snapshot.faqCount, 4), yes(snapshot.hasProcess)),
    visual_design: average(yes(snapshot.visualDirectionSet), countScore(snapshot.imageCount, 3)),
    mobile: average(yes(snapshot.mobileReviewed), yes(snapshot.tapTargetsChecked)),
    accessibility: average(yes(snapshot.headingOrderValid), yes(snapshot.contrastChecked), yes(snapshot.descriptiveControls), yes(snapshot.reducedMotionSafe)),
    seo: average(yes(snapshot.seoTitle), yes(snapshot.seoDescription), yes(snapshot.hasSingleH1), yes(snapshot.locationIntent)),
    trust: average(countScore(snapshot.reviewCount, 3), countScore(snapshot.credentialCount, 1)),
    performance: average(yes(snapshot.performanceBudgetPassed), yes(snapshot.imageOptimizationPassed)),
    publishing: average(yes(snapshot.customDomainConnected), yes(snapshot.contactRouteVerified), yes(snapshot.analyticsConfigured), yes(snapshot.legalPagesPresent)),
  };
}
