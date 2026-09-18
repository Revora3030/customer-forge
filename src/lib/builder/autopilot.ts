import type { AgentContext } from "@/lib/site-agent.server";
import type { BuilderIntent } from "./interpreter";

export type SiteDiagnosis = {
  pages: number;
  sections: number;
  completeness: number;
  conversionReadiness: number;
  contentReadiness: number;
  missingMobileCta: boolean;
  missingTrust: boolean;
  missingFaq: boolean;
  missingHomeHero: boolean;
  emptySections: number;
  pagesMissingSeo: number;
  ctaCount: number;
};

type AutopilotIntent = Pick<BuilderIntent, "goals" | "verbs" | "moods">;

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const text = (value: string | null | undefined): string => (value ?? "").trim();

/**
 * Deterministically inspects the workspace snapshot already supplied to the
 * builder. No network/model/database access occurs here.
 */
export function diagnoseSite(context: AgentContext): SiteDiagnosis {
  const pages = context.pages.length;
  const sections = context.pages.reduce((total, page) => total + page.sections.length, 0);
  const home = context.pages.find((page) => page.kind.toLowerCase() === "home") ?? context.pages[0];
  const homeSections = home?.sections ?? [];
  const hasHomeHero = homeSections.some((section) => section.kind.toLowerCase() === "hero");
  const hasCta = context.pages.some((page) =>
    page.sections.some((section) => {
      const kind = section.kind.toLowerCase();
      const body = `${text(section.heading)} ${text(section.subheading)} ${text(section.body)}`.toLowerCase();
      return kind === "cta" || /book|schedule|quote|contact|call|get started/.test(body);
    }),
  );
  const hasTrust =
    context.business.publishedReviewCount > 0 ||
    context.pages.some((page) =>
      page.sections.some((section) => {
        const content = `${text(section.heading)} ${text(section.subheading)} ${text(section.body)}`.toLowerCase();
        return section.kind.toLowerCase() === "reviews" || /review|testimonial|rating|trusted|client|customer/.test(content);
      }),
    );
  const hasFaq = context.pages.some((page) =>
    page.sections.some((section) => section.kind.toLowerCase() === "faq"),
  );
  const mobileSignal = context.pages.some((page) =>
    page.sections.some((section) => {
      const content = `${text(section.heading)} ${text(section.subheading)} ${text(section.body)}`.toLowerCase();
      return /mobile|responsive/.test(content) || section.kind.toLowerCase() === "cta";
    }),
  );

  const emptySections = context.pages.reduce(
    (count, page) =>
      count +
      page.sections.filter(
        (section) =>
          !text(section.heading) &&
          !text(section.subheading) &&
          !text(section.body) &&
          section.components.length === 0,
      ).length,
    0,
  );
  const pagesMissingSeo = context.pages.filter(
    (page) => !text(page.seo_title) || !text(page.seo_description),
  ).length;
  const ctaCount = context.pages.reduce(
    (count, page) =>
      count +
      page.sections.reduce((sectionCount, section) => {
        const kind = section.kind.toLowerCase();
        const body = [
          text(section.heading),
          text(section.subheading),
          text(section.body),
        ].join(" ").toLowerCase();
        return sectionCount + (kind === "cta" || /book|schedule|quote|contact|call|get started/.test(body) ? 1 : 0);
      }, 0),
    0,
  );

  const pageCompleteness = pages === 0 ? 0 : Math.min(100, 55 + Math.min(pages, 6) * 7);
  const sectionCompleteness = pages === 0 ? 0 : Math.min(100, Math.round((sections / Math.max(pages * 3, 1)) * 100));
  const completeness = clamp((pageCompleteness + sectionCompleteness + (hasHomeHero ? 10 : 0)) / 2);
  const conversionReadiness = clamp((hasCta ? 72 : 45) + (context.business.services.length > 0 ? 10 : 0) + (context.business.phone || context.business.email ? 8 : 0));
  const contentReadiness = clamp((text(context.business.description) ? 55 : 35) + (context.business.services.length > 0 ? 30 : 0) + (hasHomeHero ? 10 : 0));

  return {
    pages,
    sections,
    completeness,
    conversionReadiness,
    contentReadiness,
    missingMobileCta: !mobileSignal,
    missingTrust: !hasTrust,
    missingFaq: !hasFaq,
    missingHomeHero: !hasHomeHero,
    emptySections,
    pagesMissingSeo,
    ctaCount,
  };
}

/**
 * Adds only outcome vocabulary already supported by the interpreter. This is
 * intentionally conservative: it never creates business facts or fake copy.
 */
export function applyAutopilot(
  _context: AgentContext,
  instruction: string,
  baseIntent: BuilderIntent,
): AutopilotIntent {
  const value = instruction.toLowerCase();
  const goals = [...baseIntent.goals];
  const verbs = [...baseIntent.verbs];
  const moods = [...baseIntent.moods];

  const add = <T>(items: T[], valueToAdd: T) => {
    if (!items.includes(valueToAdd)) items.push(valueToAdd);
  };

  if (/more leads|more customers|more inquiries|more enquiries/.test(value)) add(goals, "leads");
  if (/more calls/.test(value)) add(goals, "calls");
  if (/more bookings|more appointments/.test(value)) add(goals, "booking");
  if (/seo|google|search ranking/.test(value)) add(goals, "seo");
  if (/mobile|phone/.test(value)) add(goals, "mobile");
  if (/premium|luxury|expensive|high[- ]end/.test(value)) add(moods, "premium");
  if (/modern|futuristic|technology/.test(value)) add(moods, "modern");
  if (/bold|strong|powerful/.test(value)) add(moods, "bold");
  if (/restyle|redesign|revamp|upgrade|improve/.test(value)) add(verbs, "restyle");
  if (/fix/.test(value)) add(verbs, "fix");
  if (/seo/.test(value)) add(verbs, "seo");
  if (/cta|call to action/.test(value)) add(verbs, "cta");
  if (/mobile/.test(value)) add(verbs, "mobile");

  return { goals, verbs, moods };
}

export function autopilotSummary(diagnosis: SiteDiagnosis): string {
  return [
    `Autopilot diagnosis: ${diagnosis.pages} page(s), ${diagnosis.sections} section(s)`,
    `completeness ${diagnosis.completeness}/100`,
    `conversion readiness ${diagnosis.conversionReadiness}/100`,
    `content readiness ${diagnosis.contentReadiness}/100`,
    `${diagnosis.emptySections} empty section(s)`,
    `${diagnosis.pagesMissingSeo} page(s) missing SEO fields`,
    `${diagnosis.ctaCount} conversion CTA(s)`,
  ].join(", ") + ".";
}
