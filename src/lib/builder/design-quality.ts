/**
 * REVORA DESIGN QUALITY SCORING
 * =============================
 *
 * Pure, explainable scoring for the existing site context. This is a diagnostic
 * signal, not a subjective brand rating: every point comes from observable
 * structure already available to the builder.
 */

import type { AgentContext } from "@/lib/site-agent.server";

export type DesignQualityDimension =
  | "structure"
  | "hierarchy"
  | "content"
  | "conversion"
  | "media"
  | "consistency";

export type DesignQualityScore = {
  score: number;
  dimensions: Record<DesignQualityDimension, number>;
  strengths: string[];
  gaps: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const GENERIC_COPY = /^(welcome|grow|services|our services|what we do|learn more|get started|common questions|why choose us)$/i;
const meaningful = (value: string | null | undefined) => {
  const clean = (value ?? "").trim();
  return clean.length >= 12 && !GENERIC_COPY.test(clean);
};

export function scoreDesignQuality(context: AgentContext): DesignQualityScore {
  const pages = context.pages.filter((page) => page.is_visible && !page.noindex);
  const sections = pages.flatMap((page) => page.sections);
  const pagesWithoutOpening = pages.filter(
    (page) => !page.sections.some((section) => section.kind === "hero" || section.kind === "intro"),
  );

  const structure = clamp(
    pages.length
      ? 45 + Math.min(35, sections.length * 5) + 20 * ((pages.length - pagesWithoutOpening.length) / pages.length)
      : 0,
  );

  const titled = pages.filter((page) => Boolean(page.title?.trim())).length;
  const headed = sections.filter((section) => meaningful(section.heading)).length;
  const hierarchy = clamp(
    (pages.length ? (titled / pages.length) * 50 : 0) +
      (sections.length ? (headed / sections.length) * 50 : 0),
  );

  const populated = sections.filter(
    (section) => meaningful(section.heading) || meaningful(section.subheading) || meaningful(section.body),
  ).length;
  const content = clamp(sections.length ? (populated / sections.length) * 100 : 0);

  const ctaSections = sections.filter((section) =>
    section.kind === "cta" ||
    section.kind === "contact" ||
    section.kind === "booking" ||
    section.components.some(
      (component) =>
        component.kind === "button" ||
        Boolean(component.link_url && /book|quote|contact|schedule|call|get.?started/i.test(component.link_url)),
    ),
  ).length;
  const conversion = clamp(sections.length ? Math.min(100, (ctaSections / Math.max(1, pages.length)) * 45) : 0);

  const mediaSections = sections.filter(
    (section) => section.kind === "gallery" || section.kind === "reviews" ||
      section.components.some((component) => component.kind === "image"),
  ).length;
  const media = clamp(sections.length ? Math.min(100, (mediaSections / Math.max(1, pages.length)) * 50) : 0);

  const heroLayouts = new Set(
    pages
      .flatMap((page) => page.sections.filter((section) => section.kind === "hero"))
      .map((section) => section.kind),
  );
  const consistency = clamp(pages.length <= 1 ? 100 : heroLayouts.size === 1 ? 100 : 70);

  const dimensions = { structure, hierarchy, content, conversion, media, consistency };
  const score = clamp(
    structure * 0.2 +
      hierarchy * 0.2 +
      content * 0.2 +
      conversion * 0.15 +
      media * 0.1 +
      consistency * 0.15,
  );

  const strengths: string[] = [];
  const gaps: string[] = pagesWithoutOpening.map((page) => `page:${page.slug}:opening`);
  for (const [name, value] of Object.entries(dimensions) as [DesignQualityDimension, number][]) {
    if (value >= 80) strengths.push(name);
    else if (value < 60) gaps.push(name);
  }

  return { score, dimensions, strengths: strengths.slice(0, 6), gaps: gaps.slice(0, 12) };
}

export function designQualitySummary(result: DesignQualityScore): string {
  const gapText = result.gaps.length ? ` Gaps: ${result.gaps.join(", ")}.` : "";
  return `Deterministic design-quality scan: ${result.score}/100.${gapText}`;
}
