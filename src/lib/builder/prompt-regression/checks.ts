/**
 * Output checks for the prompt regression suite. Pure functions: they take a
 * fixture (what the owner supplied) and a model output, and return plain-language
 * problems. An empty array means the output passed. The same checks run on the
 * stubbed responses in CI and on real model answers in the optional live run.
 */
import type { PageArchitecture } from "@/lib/builder/creative-authority";
import { auditSiteDepth } from "@/lib/builder/page-depth";
import { inputCorpus, type PromptFixture } from "./fixtures";

export type WordingPatch = { id: string; heading?: string; subheading?: string; body?: string };

/** Every string a visitor could read in a planned site. */
export function architectureText(architecture: readonly PageArchitecture[]): string[] {
  return architecture.flatMap((page) => [
    page.title,
    page.primaryAction,
    page.seoTitle ?? "",
    page.seoDescription ?? "",
    ...page.sections.flatMap((section) => [section.heading ?? "", section.subheading ?? "", section.body ?? ""]),
  ]).filter((value) => value.trim().length > 0);
}

export function patchText(patches: readonly WordingPatch[]): string[] {
  return patches.flatMap((patch) => [patch.heading ?? "", patch.subheading ?? "", patch.body ?? ""]).filter((value) => value.trim().length > 0);
}

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** Claims a model likes to add. Each is allowed only when the owner's own words contain it. */
const CLAIM_WORDS: { label: string; pattern: RegExp; stem: RegExp }[] = [
  { label: "award", pattern: /award[- ]winning|\bawards?\b/i, stem: /award/i },
  { label: "licensed/insured/bonded", pattern: /\b(licensed|insured|bonded)\b/i, stem: /licen[sc]|insur|bonded/i },
  { label: "certified", pattern: /\bcertified\b|\bcertifications?\b/i, stem: /certif/i },
  { label: "guarantee/warranty", pattern: /\bguarantee[sd]?\b|\bwarrant(y|ies)\b/i, stem: /guarant|warrant/i },
  { label: "ranking", pattern: /#\s?1\b|\bbest in\b|\btop[- ]rated\b|\bnumber one\b/i, stem: /#\s?1|best in|top[- ]rated|number one/i },
  { label: "star rating", pattern: /\b(five|5)[- ]stars?\b|\bstar[- ]rated\b/i, stem: /star/i },
  { label: "family owned", pattern: /family[- ](owned|run)|locally owned/i, stem: /family|locally owned/i },
  { label: "24/7", pattern: /24\s?\/\s?7|24 hours|around the clock|open 24/i, stem: /24|around the clock/i },
  { label: "same day", pattern: /same[- ]day/i, stem: /same[- ]day/i },
  { label: "free estimate", pattern: /free (estimate|quote|inspection|consultation)s?/i, stem: /free/i },
  { label: "years of experience", pattern: /years of experience|years in business|since (19|20)\d\d|decades/i, stem: /years|since|decades/i },
  { label: "customer count", pattern: /thousands of|hundreds of|\d[\d,]*\+? (happy )?(customers|clients|homes)/i, stem: /customers|clients/i },
  { label: "reviews", pattern: /\b(reviews?|testimonials?|rated)\b/i, stem: /review|testimonial|rated/i },
];

/** Problems: anything in the output the owner never supplied (prices, numbers, contact details, claims). */
export function inventedFactProblems(fixture: PromptFixture, strings: readonly string[]): string[] {
  const problems: string[] = [];
  const corpus = inputCorpus(fixture);
  const corpusDigits = digitsOnly(fixture.phone);
  const corpusNumbers = new Set(corpus.match(/\d+/g) ?? []);
  const supplied = (token: string) => corpus.includes(token.toLowerCase());
  for (const raw of strings) {
    // Phone numbers: only the supplied one, in any formatting.
    for (const match of raw.match(/\+?\d[\d\s().-]{6,}\d/g) ?? []) {
      if (digitsOnly(match) !== corpusDigits && !corpusDigits.endsWith(digitsOnly(match)))
        problems.push(`invented phone number "${match.trim()}" in: ${excerpt(raw)}`);
    }
    for (const match of raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
      if (match.toLowerCase() !== fixture.email.toLowerCase()) problems.push(`invented email "${match}" in: ${excerpt(raw)}`);
    // Prices: a money amount must be one the owner supplied verbatim.
    for (const match of raw.match(/\$\s?\d[\d,]*(\.\d+)?|\b\d[\d,]*\s?(dollars|usd)\b/gi) ?? [])
      if (!fixture.prices.some((price) => price.replace(/\s/g, "") === match.replace(/\s/g, "")))
        problems.push(`invented price "${match}" in: ${excerpt(raw)}`);
    // Any other number must appear in the owner's own words (the phone number is handled above).
    const withoutPhone = raw.replace(/\+?\d[\d\s().-]{6,}\d/g, " ");
    for (const match of withoutPhone.match(/\d+/g) ?? [])
      if (!corpusNumbers.has(match) && !fixture.prices.some((price) => price.includes(match)))
        problems.push(`number "${match}" is not in the supplied facts: ${excerpt(raw)}`);
    for (const claim of CLAIM_WORDS) {
      const hit = raw.match(claim.pattern);
      if (hit && !(claim.stem.test(corpus) || supplied(hit[0]))) problems.push(`unsupported ${claim.label} claim "${hit[0]}": ${excerpt(raw)}`);
    }
  }
  return [...new Set(problems)];
}

function excerpt(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

const CALL_ACTION = /\b(call|phone|text|ring)\b/i;
const LEAD_ROLES = new Set(["quote", "booking", "contact"]);

/** Problems with the plan's shape: pages, order, SEO wording, service coverage, name-in-headings. */
export function structureProblems(fixture: PromptFixture, architecture: readonly PageArchitecture[]): string[] {
  const problems: string[] = [];
  const home = architecture.find((page) => page.slug === "home");
  if (!home) return ["no home page"];
  if (architecture.length < (fixture.thin ? 2 : 3)) problems.push(`only ${architecture.length} page(s); a real site needs more`);
  if (home.sections[0]?.role !== "hero") problems.push(`home page opens with "${home.sections[0]?.role}", not a hero`);
  const slugs = architecture.map((page) => page.slug);
  if (new Set(slugs).size !== slugs.length) problems.push("duplicate page slugs");
  for (const page of architecture) {
    if (page.sections.length === 0) problems.push(`page "${page.slug}" has no sections`);
    if (page.seoTitle && page.seoTitle.length > 60) problems.push(`page "${page.slug}" seoTitle is ${page.seoTitle.length} characters (max 60)`);
    if (page.seoDescription && (page.seoDescription.length < 120 || page.seoDescription.length > 155))
      problems.push(`page "${page.slug}" seoDescription is ${page.seoDescription.length} characters (120-155)`);
    for (const section of page.sections)
      if (section.heading && section.heading.toLowerCase().includes(fixture.businessName.toLowerCase()))
        problems.push(`business name used in a section heading: "${section.heading}"`);
  }
  const everything = architectureText(architecture).join("\n").toLowerCase();
  const showsServiceCards = architecture.some((page) => page.sections.some((section) => (section.includes ?? []).includes("service_cards")));
  for (const service of fixture.services)
    if (!showsServiceCards && !everything.includes(service.toLowerCase())) problems.push(`service "${service}" is not shown anywhere`);
  const depth = auditSiteDepth(architecture);
  for (const page of architecture) {
    const measured = depth[page.slug];
    if (measured && !measured.hasClosingAction && !/privacy|terms/.test(page.slug)) problems.push(`page "${page.slug}" has no closing action`);
  }
  return problems;
}

/** Phone-first: the call action is the first thing on the home page and the contact path is on the site. */
export function phoneFirstProblems(fixture: PromptFixture, architecture: readonly PageArchitecture[]): string[] {
  const problems: string[] = [];
  const home = architecture.find((page) => page.slug === "home");
  if (!home) return ["no home page"];
  const hero = home.sections[0];
  if (hero?.role !== "hero") problems.push("home page does not open with a hero");
  if (!(hero?.includes ?? []).includes("primary_action")) problems.push("the hero carries no primary action button");
  if (!CALL_ACTION.test(home.primaryAction)) problems.push(`home primary action "${home.primaryAction}" is not a call/text action`);
  const contactRoles = architecture.flatMap((page) => page.sections.filter((section) => section.role === "contact" || section.role === "sticky_cta"));
  if (contactRoles.length === 0) problems.push("no contact or sticky call section anywhere on the site");
  // The phone number itself, when shown, must be the supplied one (checked again by inventedFactProblems).
  return problems;
}

/** Lead capture: a working quote/booking/contact section exists, and the home page reaches one. */
export function leadCaptureProblems(architecture: readonly PageArchitecture[]): string[] {
  const home = architecture.find((page) => page.slug === "home");
  if (!home) return ["no home page"];
  const problems: string[] = [];
  if (!architecture.some((page) => page.sections.some((section) => LEAD_ROLES.has(section.role)))) problems.push("no quote, booking or contact section on any page");
  const homeReaches = home.sections.some((section) => LEAD_ROLES.has(section.role) || (section.includes ?? []).includes("primary_action"));
  if (!homeReaches) problems.push("the home page has no lead-capture section and no primary action");
  return problems;
}

/** Problems with the section-wording pass output. */
export function wordingProblems(
  fixture: PromptFixture,
  sections: readonly { id: string; kind: string; body: string | null }[],
  patches: readonly WordingPatch[],
): string[] {
  const problems = inventedFactProblems(fixture, patchText(patches));
  const ids = new Set(sections.map((section) => section.id));
  for (const patch of patches) if (!ids.has(patch.id)) problems.push(`patch for unknown section "${patch.id}"`);
  const NO_BODY = new Set(["hero", "quote", "booking", "contact", "sticky_cta", "embed", "post_list", "gallery"]);
  const patched = new Map(patches.map((patch) => [patch.id, patch]));
  for (const section of sections) {
    if (NO_BODY.has(section.kind) || (section.body ?? "").trim()) continue;
    if (!patched.get(section.id)?.body) problems.push(`section "${section.id}" still has no body`);
  }
  return problems;
}

/** Instructions every prompt must keep. A prompt edit that drops one fails the suite until the contract is updated on purpose. */
export type PromptContractRule = {
  id: string;
  call: "architect" | "architectReview" | "copy" | "copyReview";
  where: "system" | "user";
  pattern: RegExp;
  why: string;
  /** Only checked for full-facts fixtures (these lines are omitted on the sparse path). */
  fullFactsOnly?: boolean;
};

export const PROMPT_CONTRACT: PromptContractRule[] = [
  { id: "architect-no-invention", call: "architect", where: "system", pattern: /Never invent facts, services, prices, reviews, awards or results/, why: "the architect must not invent facts" },
  { id: "architect-real-features-only", call: "architect", where: "system", pattern: /Working features \(quote forms, booking, contact, embeds\) exist only where listed/, why: "no invented working features" },
  { id: "architect-fact-fidelity", call: "architect", where: "user", pattern: /FACT FIDELITY/, why: "fact fidelity rule present" },
  { id: "architect-mobile-first", call: "architect", where: "user", pattern: /MOBILE-FIRST/, why: "mobile-first rule present" },
  { id: "architect-contact-one-tap", call: "architect", where: "user", pattern: /contact path is never more than one tap away/, why: "contact is one tap away", fullFactsOnly: true },
  { id: "architect-primary-action", call: "architect", where: "user", pattern: /primary_action/, why: "primary action include is offered", },
  { id: "architect-real-contact", call: "architect", where: "user", pattern: /"realContact": \{\s*"phone": true/, why: "the real phone flag reaches the architect" },
  { id: "architect-seo-limits", call: "architect", where: "user", pattern: /at most 60 characters/, why: "SEO title length limit present" },
  { id: "architect-no-name-headings", call: "architect", where: "user", pattern: /Do NOT put the business name in section headings/, why: "no business name in headings" },
  { id: "review-adversarial", call: "architectReview", where: "system", pattern: /adversarial reviewer of website structure/, why: "an independent reviewer judges the plan" },
  { id: "review-reply-shape", call: "architectReview", where: "user", pattern: /"approvedFields": \["structure"\]/, why: "reviewer reply shape" },
  { id: "copy-no-invention", call: "copy", where: "system", pattern: /Never invent a price, phone number, email address, award, review, guarantee, years in business or result/, why: "copywriter must not invent prices or contact details" },
  { id: "copy-only-facts", call: "copy", where: "user", pattern: /FACTS \(the only truth you may use\)/, why: "facts are the only truth" },
  { id: "copy-keep-ids", call: "copy", where: "user", pattern: /Keep every id exactly as given/, why: "section ids are preserved" },
  { id: "copy-review-facts", call: "copyReview", where: "system", pattern: /unsupported facts, fabricated claims, unsafe contact details/, why: "the reviewer checks facts and contact details" },
];

export function contractProblems(
  calls: readonly { kind: PromptContractRule["call"]; system: string; user: string }[],
  options: { thin: boolean },
): string[] {
  const problems: string[] = [];
  for (const rule of PROMPT_CONTRACT) {
    if (rule.fullFactsOnly && options.thin) continue;
    const matching = calls.filter((call) => call.kind === rule.call);
    if (matching.length === 0) {
      problems.push(`${rule.id}: no ${rule.call} call was made`);
      continue;
    }
    for (const call of matching)
      if (!rule.pattern.test(call[rule.where])) problems.push(`${rule.id}: ${rule.call} ${rule.where} prompt no longer says: ${rule.why}`);
  }
  return problems;
}
