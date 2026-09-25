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
