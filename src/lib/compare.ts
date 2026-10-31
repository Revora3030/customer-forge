/**
 * Comparison pages.
 *
 * These target the highest-intent free search traffic there is: an owner who
 * already knows they need something and is deciding between options. The copy
 * lives in `src/content/seo/compare/*.md`; every claim about an alternative is
 * limited to what that company publishes on its own pages, with the check date
 * stated on the page. No invented prices for other companies, no disparagement,
 * no fabricated statistics.
 */

import { COMPARE_DOCS, type SeoDoc, type SeoFaq } from "@/lib/seo-docs";

export interface Comparison {
  slug: string;
  /** Short label used in navigation, e.g. "Revora vs Wix". */
  label: string;
  /** Search-facing page title. */
  title: string;
  description: string;
  heading: string;
  /** First paragraph of the page. */
  intro: string;
  /** Page body as Markdown (no H1, no internal notes). */
  body: string;
  faqs: readonly SeoFaq[];
  words: number;
}

/** Order shown on the /compare index. */
const ORDER = [
  "revora-vs-marketing-agency",
  "revora-vs-diy-website-builder",
  "revora-vs-wix",
  "revora-vs-squarespace",
  "revora-vs-buying-leads",
  "revora-vs-hiring-office-help",
];

const firstParagraph = (body: string) =>
  body.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#") && !p.trim().startsWith("|")) ??
  "";

function toComparison(doc: SeoDoc): Comparison {
  return {
    slug: doc.slug,
    label: doc.h1,
    title: doc.title,
    description: doc.description,
    heading: doc.h1,
    intro: firstParagraph(doc.body).replace(/\s+/g, " ").trim(),
    body: doc.body,
    faqs: doc.faqs,
    words: doc.words,
  };
}

export const COMPARISONS: readonly Comparison[] = COMPARE_DOCS.filter((d) => d.file !== "index")
  .map(toComparison)
  .sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));

/** The /compare index page, written as Markdown like the pages it links to. */
export const COMPARE_INDEX: SeoDoc = COMPARE_DOCS.find((d) => d.file === "index")!;

export function findComparison(slug: string): Comparison | null {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}
