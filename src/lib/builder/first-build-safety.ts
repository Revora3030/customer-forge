/**
 * First-build safety gate. It makes NO design, structure or wording decisions:
 * it only blocks a build whose AI-written words contain unsupported claims,
 * miss the words every site must have, or use an unsafe page address.
 */
import { screenClaims, type DnaFacts } from "@/lib/business-dna";
import type { SiteCopy } from "@/lib/site-engine";

export type SafetyProblem = { code: string; detail: string };

const has = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const COPY_FIELDS: (keyof SiteCopy)[] = [
  "heroHeadline", "heroSubheadline", "primaryCta", "secondaryCta", "intro", "about",
  "areaCopy", "metaTitle", "metaDescription", "ogTitle", "ogDescription",
];

/** Search-wording bounds. A safety limit, not a style. */
export const PAGE_SEO_TITLE_MAX = 60;
export const PAGE_SEO_DESCRIPTION_MIN = 120;
export const PAGE_SEO_DESCRIPTION_MAX = 155;

type PageSeoInput = { slug: string; seoTitle?: string | null; seoDescription?: string | null };

export type PageSeoScreen = {
  /** The architect's search wording that passed, keyed by page slug. Missing means none passed. */
  accepted: Record<string, { seoTitle: string | null; seoDescription: string | null }>;
  problems: SafetyProblem[];
};

const normal = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Screens the architect's per-page search wording. Nothing is rewritten or
 * templated: a value that is too long, duplicated across pages, a copy of the
 * home description, or carries an unsupported claim is withheld (the page then
 * has no stored description and the launch review flags it).
 */
export function screenPageSeo(input: {
  facts: DnaFacts;
  pages: PageSeoInput[];
  /** The home page's own description; sub-pages may never reuse it. */
  homeDescription?: string | null;
}): PageSeoScreen {
  const problems: SafetyProblem[] = [];
  const accepted: PageSeoScreen["accepted"] = {};
  const titles = new Map<string, number>();
  const descriptions = new Map<string, number>();
  for (const page of input.pages) {
    if (has(page.seoTitle)) titles.set(normal(page.seoTitle!), (titles.get(normal(page.seoTitle!)) ?? 0) + 1);
    if (has(page.seoDescription))
      descriptions.set(normal(page.seoDescription!), (descriptions.get(normal(page.seoDescription!)) ?? 0) + 1);
  }
  const home = has(input.homeDescription) ? normal(input.homeDescription!) : null;
  const unsupported = (value: string) => screenClaims(value, input.facts)[0] ?? null;
  for (const page of input.pages) {
    let seoTitle: string | null = has(page.seoTitle) ? page.seoTitle!.trim() : null;
    let seoDescription: string | null = has(page.seoDescription) ? page.seoDescription!.trim() : null;
    if (seoTitle && seoTitle.length > PAGE_SEO_TITLE_MAX) {
      problems.push({ code: "page-seo-length", detail: `The ${page.slug} page's search title is ${seoTitle.length} characters (at most ${PAGE_SEO_TITLE_MAX}).` });
      seoTitle = null;
    }
    if (seoTitle && (titles.get(normal(seoTitle)) ?? 0) > 1) {
      problems.push({ code: "page-seo-duplicate", detail: `The ${page.slug} page's search title is used on another page too.` });
      seoTitle = null;
    }
    if (seoDescription && (seoDescription.length < PAGE_SEO_DESCRIPTION_MIN || seoDescription.length > PAGE_SEO_DESCRIPTION_MAX)) {
      problems.push({ code: "page-seo-length", detail: `The ${page.slug} page's search description is ${seoDescription.length} characters (${PAGE_SEO_DESCRIPTION_MIN}-${PAGE_SEO_DESCRIPTION_MAX}).` });
      seoDescription = null;
    }
    if (
      seoDescription &&
      ((descriptions.get(normal(seoDescription)) ?? 0) > 1 || (page.slug !== "home" && home !== null && normal(seoDescription) === home))
    ) {
      problems.push({ code: "page-seo-duplicate", detail: `The ${page.slug} page's search description repeats another page's description.` });
      seoDescription = null;
    }
    for (const [field, value] of [["title", seoTitle], ["description", seoDescription]] as const) {
      if (!value) continue;
      const issue = unsupported(value);
      if (!issue) continue;
      problems.push({ code: `unsupported-${issue.reason.replace(/\s+/g, "-")}`, detail: `Unsupported ${issue.reason} in the ${page.slug} page's search ${field}: “${issue.text}”.` });
      if (field === "title") seoTitle = null;
      else seoDescription = null;
    }
    accepted[page.slug] = { seoTitle, seoDescription };
  }
  return { accepted, problems };
}

export function checkFirstBuildSafety(input: { facts: DnaFacts; copy: SiteCopy }): SafetyProblem[] {
  const problems: SafetyProblem[] = [];
  const lines = [
    ...COPY_FIELDS.map((key) => String(input.copy[key] ?? "")),
    ...input.copy.benefits,
    ...input.copy.serviceCards.flatMap((card) => [card.name, card.copy]),
    ...input.copy.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ];
  for (const line of lines) {
    for (const issue of screenClaims(line, input.facts)) {
      problems.push({ code: `unsupported-${issue.reason.replace(/\s+/g, "-")}`, detail: `Unsupported ${issue.reason}: “${issue.text}”.` });
    }
  }
  if (!has(input.copy.heroHeadline)) problems.push({ code: "missing-headline", detail: "The home page needs a headline." });
  if (!has(input.copy.primaryCta)) problems.push({ code: "missing-primary-action", detail: "The website needs one clear primary action." });
  if (!has(input.copy.metaTitle) || !has(input.copy.metaDescription)) problems.push({ code: "missing-search-metadata", detail: "Search title and description are required." });
  return problems;
}
