/**
 * REVORA MOBILE QUALITY INTELLIGENCE
 * ==================================
 *
 * Pure deterministic mobile-readiness scoring from the existing site map.
 * This layer intentionally does not pretend to have browser measurements.
 */

import type { AgentContext } from "@/lib/site-agent.server";

type Section = AgentContext["pages"][number]["sections"][number];

export type MobileQualityDimension =
  | "layout"
  | "content"
  | "interaction"
  | "navigation"
  | "media";

export type MobileQualityScore = {
  score: number;
  dimensions: Record<MobileQualityDimension, number>;
  strengths: string[];
  gaps: string[];
  scannedPages: number;
  scannedSections: number;
};

const MOBILE_TERMS = /\b(mobile|responsive|phone|phones|tablet|small screen|touch)\b/i;

function visibleSections(context: AgentContext): Section[] {
  return context.pages
    .filter((page) => page.is_visible && !page.noindex)
    .flatMap((page) => page.sections.filter((section) => section.is_visible));
}

function scoreDimension(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function isMobileQualityRequest(instruction: string): boolean {
  return MOBILE_TERMS.test(instruction);
}

export function scoreMobileQuality(context: AgentContext): MobileQualityScore {
  const pages = context.pages.filter((page) => page.is_visible && !page.noindex);
  const sections = visibleSections(context);

  if (!pages.length || !sections.length) {
    return {
      score: 0,
      dimensions: { layout: 0, content: 0, interaction: 0, navigation: 0, media: 0 },
      strengths: [],
      gaps: ["No visible page sections are available for mobile analysis."],
      scannedPages: pages.length,
      scannedSections: sections.length,
    };
  }

  const riskyLongCopy = sections.filter((s) =>
    [s.heading, s.subheading, s.body].filter(Boolean).join(" ").length > 700,
  ).length;
  const denseSections = sections.filter((s) => s.components.length > 8).length;
  const mediaSections = sections.filter((s) => ["gallery", "reviews"].includes(s.kind)).length;
  const interactive = sections.flatMap((s) => s.components).filter((c) =>
    Boolean(c.link_url || c.link_label),
  ).length;
  const ctaLike = sections.flatMap((s) => s.components).filter((c) =>
    /\b(book|quote|estimate|contact|call|get started|schedule|appointment)\b/i.test(
      [c.label, c.link_label].filter(Boolean).join(" "),
    ),
  ).length;

  const layout = scoreDimension(
    100 - ((denseSections / sections.length) * 55 + (riskyLongCopy / sections.length) * 25),
  );
  const content = scoreDimension(
    100 - (riskyLongCopy / sections.length) * 60,
  );
  const interaction = scoreDimension(
    Math.min(100, 55 + Math.min(25, interactive * 5) + Math.min(20, ctaLike * 20)),
  );
  const navigation = scoreDimension(
    Math.min(100, 60 + Math.min(40, Math.max(0, pages.length - 1) * 8)),
  );
  const media = scoreDimension(
    mediaSections ? Math.min(100, 72 + Math.min(28, mediaSections * 8)) : 60,
  );

  const dimensions = { layout, content, interaction, navigation, media };
  const score = scoreDimension(
    layout * 0.30 + content * 0.20 + interaction * 0.20 + navigation * 0.15 + media * 0.15,
  );

  const strengths = Object.entries(dimensions)
    .filter(([, value]) => value >= 80)
    .map(([name]) => `${name} signals are strong`);
  const gaps = Object.entries(dimensions)
    .filter(([, value]) => value < 70)
    .map(([name]) => `${name} needs mobile refinement`);

  return {
    score,
    dimensions,
    strengths,
    gaps,
    scannedPages: pages.length,
    scannedSections: sections.length,
  };
}

export function mobileQualitySummary(result: MobileQualityScore): string {
  return `Deterministic mobile-quality scan: ${result.score}/100 across ${result.scannedPages} page${result.scannedPages === 1 ? "" : "s"} and ${result.scannedSections} section${result.scannedSections === 1 ? "" : "s"}.`;
}
