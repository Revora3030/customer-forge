/**
 * Launch-blocking content completeness checks.
 *
 * A site is not launch-ready just because every route exists. These checks
 * catch the gaps a visitor notices first: a legal page that admits it is a
 * placeholder, a priced service that never says what is included, and a
 * gallery page with no pictures. They only inspect what is already on the
 * page; they never write copy. Fixes stay with the AI team and the owner.
 *
 * The data-handling inventory gives the AI author of a privacy page the real
 * facts (what the site's forms actually collect and where it goes) so the
 * policy can be accurate without inventing practices.
 */
import type { CompositionNode, CompositionTree } from "./composition-tree";

export type CompletenessPage = {
  slug: string;
  title: string | null;
  /** Every composition tree on the page, in section order. */
  trees: CompositionTree[];
};

export type CompletenessService = {
  name: string;
  description: string | null;
  price: number | null;
  startingPrice: number | null;
};

export type CompletenessFinding = {
  code: "legal_placeholder" | "legal_too_thin" | "service_without_inclusions" | "gallery_without_images";
  /** Page slug or service name the finding is about. */
  subject: string;
  /** Plain-language problem for the owner. */
  detail: string;
  /** What fixes it, without prescribing copy. */
  fix: string;
};

const LEGAL_PAGE = /(^|[-_\s/])(privacy|terms|legal|cookies?|disclaimer)([-_\s/]|$)/i;
const GALLERY_PAGE = /(^|[-_\s/])(gallery|portfolio|our-work|projects)([-_\s/]|$)/i;

/** Phrases that mean the page itself says the real text is missing. */
const PLACEHOLDER = [
  /\bnot (?:yet )?(?:been )?(?:supplied|provided|available|written|published)\b/i,
  /\bhas(?: not|n't) (?:been )?(?:supplied|provided|written|published)\b/i,
  /\bcoming soon\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\[(?:insert|your|company|business|date)[^\]]*\]/i,
  /\b(?:tbd|tba|to be (?:added|confirmed|determined))\b/i,
];

/** A real privacy notice covers collection, use and contact at minimum. */
const MIN_LEGAL_WORDS = 150;
/** Shorter than this, a service description cannot say what is included. */
const MIN_INCLUSION_CHARS = 40;

function walk(node: CompositionNode, visit: (node: CompositionNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
  for (const tab of node.tabs ?? []) for (const child of tab.children) walk(child, visit);
}

/** Visible text of a page, in order. */
export function pageText(page: CompletenessPage): string {
  const parts: string[] = [];
  for (const tree of page.trees)
    walk(tree.root, (node) => {
      if (node.text) parts.push(node.text);
      for (const item of node.items ?? []) parts.push(item);
      for (const faq of node.faqItems ?? []) parts.push(faq.question, faq.answer);
    });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Pictures a visitor actually sees on the page (inline images and before/after pairs). */
export function pageImageCount(page: CompletenessPage): number {
  let count = 0;
  for (const tree of page.trees)
    walk(tree.root, (node) => {
      if ((node.src && node.src.trim()) || (node.mediaRef && node.mediaRef.trim())) count += 1;
      if (node.beforeImage?.src && node.afterImage?.src) count += 2;
    });
  return count;
}

const words = (text: string) => (text.match(/[A-Za-z0-9'’-]+/g) ?? []).length;
const label = (page: CompletenessPage) => page.title?.trim() || page.slug;

export function auditContentCompleteness(input: {
  pages: CompletenessPage[];
  services: CompletenessService[];
}): CompletenessFinding[] {
  const findings: CompletenessFinding[] = [];

  for (const page of input.pages) {
    const name = `${page.slug} ${page.title ?? ""}`;
    if (LEGAL_PAGE.test(name)) {
      const text = pageText(page);
      if (PLACEHOLDER.some((pattern) => pattern.test(text))) {
        findings.push({
          code: "legal_placeholder",
          subject: page.slug,
          detail: `The ${label(page)} page says its real text is missing, so visitors see a placeholder where a policy should be.`,
          fix: "Have the AI team write the policy from the site's real data-handling facts, then review it before publishing.",
        });
      } else if (words(text) < MIN_LEGAL_WORDS) {
        findings.push({
          code: "legal_too_thin",
          subject: page.slug,
          detail: `The ${label(page)} page has only ${words(text)} words, too little to explain what the site collects, why, and how to ask about it.`,
          fix: "Have the AI team expand it from the site's real data-handling facts.",
        });
      }
    }
    if (GALLERY_PAGE.test(name) && pageImageCount(page) === 0) {
      findings.push({
        code: "gallery_without_images",
        subject: page.slug,
        detail: `The ${label(page)} page has no pictures, so it cannot show the quality of the work.`,
        fix: "Upload real photos of completed work (with a short description each), or remove the page until there are some.",
      });
    }
  }

  for (const service of input.services) {
    const priced = (service.price ?? 0) > 0 || (service.startingPrice ?? 0) > 0;
    const description = (service.description ?? "").trim();
    if (priced && description.length < MIN_INCLUSION_CHARS) {
      findings.push({
        code: "service_without_inclusions",
        subject: service.name,
        detail: `"${service.name}" shows a price but never says what is included, so customers have to ask before booking.`,
        fix: "Add what the service includes (and any size or add-on pricing) in Business details > Services.",
      });
    }
  }

  return findings;
}

/** Fields the platform's own site forms ask for (SiteForms.tsx). */
const ENQUIRY_FIELDS = ["name", "phone", "email", "city", "service wanted", "message"];
const BOOKING_FIELDS = ["preferred date", "preferred time"];

/**
 * The verified facts the AI author of a privacy, terms or other legal page
 * works from, plus the questions it must leave to the owner. Every site
 * carries the platform enquiry form and records page visits.
 */
export function legalPageFacts(input: {
  businessName: string;
  email: string | null;
  goals: string[];
}): string[] {
  const hasBooking = input.goals.includes("book");
  const { statements, unknowns } = dataHandlingInventory({
    businessName: input.businessName,
    contactEmail: input.email,
    collectedFields: [...ENQUIRY_FIELDS, ...(hasBooking ? BOOKING_FIELDS : [])],
    hasQuoteForm: input.goals.includes("quote"),
    hasBooking,
    analyticsEnabled: true,
  });
  return [
    ...statements,
    ...unknowns.map((unknown) => `Not known (do not state or guess; say the business can be asked): ${unknown}.`),
  ];
}

export type DataHandlingFacts = {
  businessName: string;
  contactEmail: string | null;
  /** Fields the site's live forms actually ask for. */
  collectedFields: string[];
  hasQuoteForm: boolean;
  hasBooking: boolean;
  analyticsEnabled: boolean;
};

/**
 * The only statements a privacy page may make about data handling, built
 * from what the site really does. Anything not listed here (retention
 * periods, third-party sharing beyond the platform, cookies beyond analytics)
 * is unknown and must be asked of the owner, not assumed.
 */
export function dataHandlingInventory(facts: DataHandlingFacts): {
  statements: string[];
  unknowns: string[];
} {
  const fields = [...new Set(facts.collectedFields.map((field) => field.trim().toLowerCase()).filter(Boolean))];
  const purposes = [
    facts.hasQuoteForm ? "preparing a quote" : null,
    facts.hasBooking ? "scheduling a booking" : null,
    "replying to the visitor's request",
  ].filter((value): value is string => Boolean(value));
  const statements = [
    fields.length
      ? `The site's forms collect: ${fields.join(", ")}.`
      : "The site has no forms that collect personal information.",
    `${facts.businessName} uses this information for ${purposes.join(", ")}.`,
    "Form submissions are stored in the business's Revora workspace and the business is notified by email.",
    facts.analyticsEnabled
      ? "The site records page visits for analytics."
      : "The site does not run visitor analytics.",
    facts.contactEmail
      ? `Questions about personal information can be sent to ${facts.contactEmail}.`
      : "Questions about personal information can be sent through the site's contact form.",
  ];
  return {
    statements,
    unknowns: [
      "How long the business keeps form submissions",
      "Whether the business shares information with anyone beyond Revora (for example a scheduling or payment service)",
    ],
  };
}
