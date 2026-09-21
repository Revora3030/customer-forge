import { describe, expect, it } from 'vitest';
import { launchQualityInputFromSnapshot, type SiteReadinessSnapshot } from './launch-quality-signals';

const completeSnapshot: SiteReadinessSnapshot = {
  hasPrimaryCta: true, ctaRepeatedAtDecisionPoints: true, heroIncludesAudience: true, heroIncludesOutcome: true, hasDifferentiator: true,
  serviceCount: 3, faqCount: 4, hasProcess: true, visualDirectionSet: true, imageCount: 3, mobileReviewed: true, tapTargetsChecked: true,
  headingOrderValid: true, contrastChecked: true, descriptiveControls: true, reducedMotionSafe: true, seoTitle: true, seoDescription: true,
  hasSingleH1: true, locationIntent: true, reviewCount: 3, credentialCount: 1, performanceBudgetPassed: true, imageOptimizationPassed: true,
  customDomainConnected: true, contactRouteVerified: true, analyticsConfigured: true, legalPagesPresent: true,
};

describe('launchQualityInputFromSnapshot', () => {
  it('does not turn configured assets into a subjective visual score', () => {
    expect(launchQualityInputFromSnapshot(completeSnapshot)).toEqual({
      conversion: 100, messaging: 100, content: 100, visual_design: 0, mobile: 100, accessibility: 100, seo: 100, trust: 100, performance: 100, publishing: 100,
    });
  });

  it('turns missing launch signals into focused low scores', () => {
    const scores = launchQualityInputFromSnapshot({ ...completeSnapshot, hasPrimaryCta: false, ctaRepeatedAtDecisionPoints: false, customDomainConnected: false, analyticsConfigured: false });

    expect(scores.conversion).toBe(0);
    expect(scores.publishing).toBe(50);
  });
});
