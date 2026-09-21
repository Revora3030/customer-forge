/**
 * LAUNCH REVIEW — turns real workspace facts into the launch-quality report.
 *
 * Rules:
 * - Deterministic. No AI, no network, no fabricated evidence.
 * - A signal that has not been measured is reported as NOT measured, never as
 *   a pass. Unmeasured accessibility/performance/mobile therefore lowers the
 *   score honestly instead of flattering the owner before launch.
 * - Search and performance verdicts come from the shared contracts in
 *   src/lib/seo/site-seo-contract.ts and src/lib/performance/performance-budget.ts
 *   so preflight, launch review and publish all judge the same way.
 */

import { assessLaunchQuality, type LaunchQualityReport } from "./launch-quality-gate";
import { launchQualityInputFromSnapshot, type SiteReadinessSnapshot } from "./launch-quality-signals";
import { evaluateSeo, type SeoSignals } from "@/lib/seo/site-seo-contract";
import {
  evaluatePerformanceBudget,
  type PerformanceSignals,
} from "@/lib/performance/performance-budget";

export type LaunchReviewFacts = {
  /** Website + business content already stored for this workspace. */
  headline: string;
  subheadline: string;
  metaDescription: string;
  primaryCtaLabel: string;
  businessDescription: string;
  audience: string;
  city: string;
  serviceArea: string;
  serviceCount: number;
  faqCount: number;
  reviewCount: number;
  credentialCount: number;
  imageCount: number;
  hasProcessSection: boolean;
  hasHeroImage: boolean;
  visualDirectionSet: boolean;
  ctaSectionCount: number;
  captureSectionPresent: boolean;
  legalPagesPresent: boolean;
  analyticsConfigured: boolean;
  contactRouteVerified: boolean;
  customDomainConnected: boolean;
  /** Real-browser evidence, or null when nobody has measured the site yet. */
  measurement: LaunchReviewMeasurement | null;
};

export type LaunchReviewMeasurement = {
  measuredAt: string;
  widths: number[];
  seo: SeoSignals;
  performance: PerformanceSignals;
  smallTargetCount: number;
  overflowCount: number;
  headingOrderProblems: number;
  lowContrastCount: number;
  unlabeledControlCount: number;
  zoomBlocked: boolean;
};

export type LaunchReviewEvidence = {
  key: string;
  state: "measured" | "not_measured";
  detail: string;
};

export type LaunchReview = {
  report: LaunchQualityReport;
  snapshot: SiteReadinessSnapshot;
  seo: { measured: boolean; score: number; failures: string[] };
  performance: { measured: boolean; passed: boolean; failures: string[] };
  evidence: LaunchReviewEvidence[];
  measuredAt: string | null;
};

/** The eight widths every launch measurement must cover. */
export const REQUIRED_REVIEW_WIDTHS = [320, 375, 390, 414, 768, 1024, 1280, 1440] as const;

function filled(value: string): boolean {
  return value.trim().length > 0;
}

function mentionsAudience(facts: LaunchReviewFacts): boolean {
  const hero = `${facts.headline} ${facts.subheadline}`.toLowerCase();
  const audience = facts.audience.trim().toLowerCase();
  if (audience.length > 2 && hero.includes(audience)) return true;
  const place = (facts.city || facts.serviceArea).trim().toLowerCase();
  return place.length > 2 && hero.includes(place);
}

function mentionsOutcome(facts: LaunchReviewFacts): boolean {
  const hero = `${facts.headline} ${facts.subheadline}`.trim();
  // An outcome needs more than a bare business name: a verb-length phrase.
  return hero.split(/\s+/).filter(Boolean).length >= 6;
}

function coversRequiredWidths(widths: number[]): boolean {
  return REQUIRED_REVIEW_WIDTHS.every((width) => widths.includes(width));
}

export function buildReadinessSnapshot(facts: LaunchReviewFacts): SiteReadinessSnapshot {
  const m = facts.measurement;
  const fullWidths = !!m && coversRequiredWidths(m.widths);
  const seo = m ? evaluateSeo(m.seo) : null;
  const performance = m ? evaluatePerformanceBudget(m.performance) : null;

  return {
    hasPrimaryCta: filled(facts.primaryCtaLabel) || facts.captureSectionPresent,
    ctaRepeatedAtDecisionPoints: facts.ctaSectionCount >= 2,
    heroIncludesAudience: mentionsAudience(facts),
    heroIncludesOutcome: mentionsOutcome(facts),
    hasDifferentiator: facts.businessDescription.trim().split(/\s+/).filter(Boolean).length >= 12,
    serviceCount: facts.serviceCount,
    faqCount: facts.faqCount,
    hasProcess: facts.hasProcessSection,
    visualDirectionSet: facts.visualDirectionSet,
    imageCount: facts.imageCount + (facts.hasHeroImage ? 1 : 0),
    // Mobile is only "reviewed" when a real browser measured every phone width.
    mobileReviewed: fullWidths,
    tapTargetsChecked: !!m && fullWidths && m.smallTargetCount === 0 && m.overflowCount === 0,
    headingOrderValid: !!m && m.headingOrderProblems === 0 && m.seo.h1Count === 1,
    contrastChecked: !!m && m.lowContrastCount === 0,
    descriptiveControls: !!m && m.unlabeledControlCount === 0,
    reducedMotionSafe: !!m && !m.zoomBlocked,
    seoTitle: !!seo && !seo.failures.includes("title length"),
    seoDescription: filled(facts.metaDescription) && !!seo && !seo.failures.includes("meta description length"),
    hasSingleH1: !!m && m.seo.h1Count === 1,
    locationIntent: filled(facts.city) || filled(facts.serviceArea),
    reviewCount: facts.reviewCount,
    credentialCount: facts.credentialCount,
    performanceBudgetPassed: !!performance && performance.passed,
    imageOptimizationPassed: !!m && m.performance.requestCount <= 80 && !!performance?.passed,
    customDomainConnected: facts.customDomainConnected,
    contactRouteVerified: facts.contactRouteVerified,
    analyticsConfigured: facts.analyticsConfigured,
    legalPagesPresent: facts.legalPagesPresent,
  };
}

export function reviewLaunchQuality(facts: LaunchReviewFacts): LaunchReview {
  const snapshot = buildReadinessSnapshot(facts);
  const report = assessLaunchQuality(launchQualityInputFromSnapshot(snapshot));
  const m = facts.measurement;
  const seoResult = m ? evaluateSeo(m.seo) : { score: 0, failures: ["not measured"] };
  const performanceResult = m
    ? evaluatePerformanceBudget(m.performance)
    : { passed: false, failures: ["not measured"] };

  const evidence: LaunchReviewEvidence[] = [
    {
      key: "browser_measurement",
      state: m ? "measured" : "not_measured",
      detail: m
        ? `Measured in a real browser at ${m.widths.length} screen widths.`
        : "Nobody has measured your pages in a real browser yet — run the visual check.",
    },
    {
      key: "required_widths",
      state: m && coversRequiredWidths(m.widths) ? "measured" : "not_measured",
      detail: `Phone to desktop widths required: ${REQUIRED_REVIEW_WIDTHS.join(", ")}.`,
    },
    {
      key: "search",
      state: m ? "measured" : "not_measured",
      detail: m
        ? seoResult.failures.length === 0
          ? "Search basics pass on the rendered pages."
          : `Search needs work: ${seoResult.failures.join(", ")}.`
        : "Search checks read the rendered page, so they need a visual check first.",
    },
    {
      key: "performance",
      state: m ? "measured" : "not_measured",
      detail: m
        ? performanceResult.passed
          ? "Page weight and loading speed are inside budget."
          : `Over budget: ${performanceResult.failures.join(", ")}.`
        : "Loading speed is measured in the browser, not guessed.",
    },
  ];

  return {
    report,
    snapshot,
    seo: { measured: !!m, score: seoResult.score, failures: seoResult.failures },
    performance: { measured: !!m, passed: performanceResult.passed, failures: performanceResult.failures },
    evidence,
    measuredAt: m?.measuredAt ?? null,
  };
}
