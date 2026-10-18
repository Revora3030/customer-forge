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
import { launchQualityInputFromSnapshot, notApplicableFromSnapshot, type SiteReadinessSnapshot } from "./launch-quality-signals";
import { evaluateSeo, type SeoSignals } from "@/lib/seo/site-seo-contract";
import {
  evaluatePerformanceBudget,
  type PerformanceSignals,
} from "@/lib/performance/performance-budget";
import { inspectImageSources, type ImageSourcePage } from "./media-integrity";

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
  /** Passing visual-check score for the current site revision, or null. */
  visualCheckScore?: number | null;
  publicAddressAvailable?: boolean;
  /** Real-browser evidence, or null when nobody has measured the site yet. */
  measurement: LaunchReviewMeasurement | null;
  /**
   * The stored page tree. When supplied, every visible page is checked for
   * image blocks with no picture and for stock pictures (whose credit lines
   * are not rendered yet). Omitted means those checks were not run.
   */
  pages?: LaunchReviewPage[];
  /** The workspace's media rows: where each stored picture came from. */
  mediaSources?: { url: string; source: string | null }[];
};

export type LaunchReviewPage = {
  slug: string;
  visible?: boolean | null;
  sections: {
    kind: string;
    visible?: boolean | null;
    components?: { kind: string; media_url?: string | null; visible?: boolean | null }[] | null;
  }[];
};

/** A problem that must be fixed before launch, whatever the score says. */
export type LaunchReviewBlocker = {
  code: "image_without_photo" | "stock_credit_missing";
  blocking: true;
  page: string;
  section: string;
  detail: string;
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
  /** Launch blockers found in the stored site (empty when none, or not checked). */
  blockers: LaunchReviewBlocker[];
};

/** Only what a visitor can see: visible pages, sections and blocks. */
function visiblePages(pages: LaunchReviewPage[]): ImageSourcePage[] {
  return pages
    .filter((page) => page.visible !== false)
    .map((page) => ({
      slug: page.slug,
      sections: page.sections
        .filter((section) => section.visible !== false)
        .map((section) => ({
          kind: section.kind,
          components: (section.components ?? []).filter((component) => component.visible !== false),
        })),
    }));
}

/**
 * Deterministic launch blockers from the stored site:
 * - an image block with no picture renders as an empty box;
 * - a stock picture needs its credit shown, and credit lines are not rendered
 *   on customer sites yet, so stock cannot ship until that exists.
 */
export function launchBlockers(facts: Pick<LaunchReviewFacts, "pages" | "mediaSources">): LaunchReviewBlocker[] {
  if (!facts.pages) return [];
  const pages = visiblePages(facts.pages);
  const blockers: LaunchReviewBlocker[] = inspectImageSources(pages)
    .filter((violation) => violation.kind === "image_component_without_source")
    .map((violation) => ({
      code: "image_without_photo",
      blocking: true,
      page: violation.page,
      section: violation.section,
      detail: `An image block on the ${violation.page} page has no photo behind it and would show an empty box.`,
    }));
  const stock = new Set(
    (facts.mediaSources ?? [])
      .filter((row) => (row.source ?? "").trim().toLowerCase().startsWith("stock"))
      .map((row) => row.url),
  );
  if (stock.size)
    for (const page of pages)
      for (const section of page.sections)
        for (const component of section.components ?? []) {
          const url = typeof component.media_url === "string" ? component.media_url : "";
          if (!url || !stock.has(url)) continue;
          blockers.push({
            code: "stock_credit_missing",
            blocking: true,
            page: page.slug,
            section: section.kind,
            detail: `The ${page.slug} page shows a stock photo whose required credit is not displayed on the site yet. Replace it with your own photo before launch.`,
          });
        }
  return blockers;
}

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
    visualCheckScore: facts.visualCheckScore ?? null,
    publicAddressAvailable: facts.publicAddressAvailable === true,
  };
}

export function reviewLaunchQuality(facts: LaunchReviewFacts): LaunchReview {
  const snapshot = buildReadinessSnapshot(facts);
  const assessed = assessLaunchQuality(launchQualityInputFromSnapshot(snapshot), {
    notApplicable: notApplicableFromSnapshot(snapshot),
  });
  const blockers = launchBlockers(facts);
  // A blocker is the next thing to fix, ahead of any score-based finding.
  const blockerFindings = [...new Set(blockers.map((blocker) => blocker.code))].map((code) => ({
    dimension: "publishing" as const,
    score: 0,
    weight: 0,
    priority: "critical" as const,
    title: code === "image_without_photo" ? "Fill or remove empty picture boxes" : "Replace stock photos before launch",
    recommendation:
      code === "image_without_photo"
        ? "Some image blocks have no photo behind them. Add your own photo or ask the builder to redesign those sections."
        : "Stock photos need a visible credit, which customer sites do not show yet. Swap them for your own photos.",
  }));
  const report = blockerFindings.length
    ? { ...assessed, findings: [...blockerFindings, ...assessed.findings], nextAction: blockerFindings[0] ?? null }
    : assessed;
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
    {
      key: "media_integrity",
      state: facts.pages ? "measured" : "not_measured",
      detail: !facts.pages
        ? "Pictures on the stored pages have not been checked."
        : blockers.length
          ? `${blockers.length} picture problem${blockers.length === 1 ? "" : "s"} must be fixed before launch.`
          : "Every image block on a visible page has a photo, and no uncredited stock photo is shown.",
    },
  ];

  return {
    report,
    snapshot,
    seo: { measured: !!m, score: seoResult.score, failures: seoResult.failures },
    performance: { measured: !!m, passed: performanceResult.passed, failures: performanceResult.failures },
    evidence,
    measuredAt: m?.measuredAt ?? null,
    blockers,
  };
}
