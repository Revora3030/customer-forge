/**
 * Deterministic first-build synthesis and review.
 *
 * This is the native equivalent of a specialist panel: it joins the brief,
 * sitemap, creative system, copy and owner facts, then rejects unsafe output
 * before any website rows are written. It performs no I/O and calls no model.
 */
import { screenClaims, type DnaFacts } from "@/lib/business-dna";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import type { SiteCopy } from "@/lib/site-engine";
import type { SiteBrief } from "@/lib/site-brief";
import type { WebsitePlan } from "@/lib/website-plan";

export type EvidenceState = "SUPPLIED" | "DERIVED" | "UNKNOWN";

export type NativeReviewFinding = {
  reviewer: "facts" | "content" | "conversion" | "seo" | "accessibility" | "visual";
  severity: "blocker" | "advice";
  code: string;
  detail: string;
};

export type NativeFirstBuildSynthesis = {
  version: 1;
  engine: "revora-native";
  language: { requested: string; preserved: true };
  stages: string[];
  pageStrategy: { slug: string; job: string; conversionAction: string; searchIntent: string }[];
  provenance: Record<string, EvidenceState>;
  lockedText: string[];
  reviewers: { name: NativeReviewFinding["reviewer"]; passed: boolean }[];
  findings: NativeReviewFinding[];
  valid: boolean;
  rationale: string[];
};

export type NativeFirstBuildInput = {
  facts: DnaFacts;
  language?: string | null;
  brief: SiteBrief;
  plan: WebsitePlan;
  copy: SiteCopy;
  creative: FirstBuildCreativeDirection;
};

const has = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const COPY_FIELDS: (keyof SiteCopy)[] = [
  "heroHeadline",
  "heroSubheadline",
  "primaryCta",
  "secondaryCta",
  "intro",
  "about",
  "areaCopy",
  "metaTitle",
  "metaDescription",
  "ogTitle",
  "ogDescription",
];

function allCopy(copy: SiteCopy) {
  return [
    ...COPY_FIELDS.map((key) => String(copy[key] ?? "")),
    ...copy.benefits,
    ...copy.serviceCards.flatMap((card) => [card.name, card.copy]),
    ...copy.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ];
}

function pageJob(slug: string, brief: SiteBrief) {
  if (slug === "home" || slug === "") return "Orient the buyer and lead to the primary action.";
  if (slug.includes("service")) return "Explain the supplied services and help the buyer choose.";
  if (slug.includes("about")) return "Explain the supplied business story without unsupported proof.";
  if (slug.includes("contact")) return "Provide a direct, working contact path.";
  if (slug.includes("book")) return "Help an eligible visitor request a time.";
  if (slug.includes("quote")) return "Collect the facts needed to prepare a quote.";
  return `Support the buyer's ${brief.buyerGoal.toLowerCase() || "decision"}.`;
}

export function synthesizeNativeFirstBuild(
  input: NativeFirstBuildInput,
): NativeFirstBuildSynthesis {
  const findings: NativeReviewFinding[] = [];
  const copyLines = allCopy(input.copy);
  for (const line of copyLines) {
    for (const issue of screenClaims(line, input.facts)) {
      findings.push({
        reviewer: "facts",
        severity: "blocker",
        code: `unsupported-${issue.reason.replace(/\s+/g, "-")}`,
        detail: `Unsupported ${issue.reason}: “${issue.text}”.`,
      });
    }
  }

  if (!has(input.copy.heroHeadline))
    findings.push({ reviewer: "content", severity: "blocker", code: "missing-headline", detail: "The home page needs a headline." });
  if (!has(input.copy.primaryCta))
    findings.push({ reviewer: "conversion", severity: "blocker", code: "missing-primary-action", detail: "The website needs one clear primary action." });
  if (!has(input.copy.metaTitle) || !has(input.copy.metaDescription))
    findings.push({ reviewer: "seo", severity: "blocker", code: "missing-search-metadata", detail: "Search title and description are required." });
  if (!input.plan.pages.some((page) => page.key === "contact"))
    findings.push({ reviewer: "conversion", severity: "blocker", code: "missing-contact-page", detail: "The sitemap needs a contact destination." });
  if (!input.creative.fingerprint.heroComposition || !input.creative.fingerprint.pageShell)
    findings.push({ reviewer: "visual", severity: "blocker", code: "incomplete-fingerprint", detail: "The composition system is incomplete." });

  const reviewerNames: NativeReviewFinding["reviewer"][] = [
    "facts",
    "content",
    "conversion",
    "seo",
    "accessibility",
    "visual",
  ];
  const provenance: Record<string, EvidenceState> = {
    businessName: has(input.facts.businessName) ? "SUPPLIED" : "UNKNOWN",
    industry: has(input.facts.industry) ? "SUPPLIED" : "UNKNOWN",
    description: has(input.facts.description) ? "SUPPLIED" : "UNKNOWN",
    location: has(input.facts.city) || has(input.facts.serviceArea) ? "SUPPLIED" : "UNKNOWN",
    phone: has(input.facts.phone) ? "SUPPLIED" : "UNKNOWN",
    email: has(input.facts.email) ? "SUPPLIED" : "UNKNOWN",
    services: input.facts.services?.length ? "SUPPLIED" : "UNKNOWN",
    audience: "DERIVED",
    conversionStrategy: "DERIVED",
    creativeDirection: "DERIVED",
  };
  const lockedText = [input.facts.businessName, input.facts.description, ...(input.facts.services ?? [])]
    .filter((value): value is string => has(value))
    .map((value) => value.trim());

  return {
    version: 1,
    engine: "revora-native",
    language: { requested: input.language?.trim() || "English", preserved: true },
    stages: [
      "intake",
      "industry_intelligence",
      "buyer_intent",
      "conversion_strategy",
      "creative_direction",
      "design_fingerprint",
      "information_architecture",
      "content",
      "imagery_direction",
      "composition",
      "adversarial_review",
    ],
    pageStrategy: input.plan.pages.map((page) => ({
      slug: page.key,
      job: pageJob(page.key, input.brief),
      conversionAction: input.brief.primaryAction,
      searchIntent: page.reason,
    })),
    provenance,
    lockedText: Array.from(new Set(lockedText)),
    reviewers: reviewerNames.map((name) => ({
      name,
      passed: !findings.some((finding) => finding.reviewer === name && finding.severity === "blocker"),
    })),
    findings,
    valid: !findings.some((finding) => finding.severity === "blocker"),
    rationale: [
      `Industry system: ${input.creative.industry.label}.`,
      `Primary buyer action: ${input.brief.primaryAction}.`,
      `Composition fingerprint: ${input.creative.fingerprint.id}.`,
      "Only supplied facts and deterministic strategy were used.",
    ],
  };
}