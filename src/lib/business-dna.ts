/**
 * REVORA BUSINESS DNA — the one authoritative understanding of a client's
 * business that every AI subsystem reads from.
 *
 * Two hard rules, enforced by this module rather than by prompt wording:
 *
 * 1. Every field is either derived from a fact the client actually supplied, or
 *    it is listed in `unknown` / `needed`. Nothing is invented.
 * 2. Claim classes that could get a real business in trouble — reviews, awards,
 *    licences, certifications, guarantees, statistics, prices, extra locations —
 *    are listed in `prohibited` and can be screened out of generated copy with
 *    `screenClaims()`.
 *
 * The module is pure and browser-safe so the builder, the generator, Pre-Flight
 * and self-healing all reason from the same object.
 */
import { playbookFor } from "@/lib/builder/industry-playbook";

export type BusinessDna = {
  /* identity — supplied facts only */
  name: string;
  industry: string | null;
  subIndustry: string | null;
  services: string[];
  city: string | null;
  region: string | null;
  country: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;

  /* factual conversion input */
  desiredAction: string;

  /* honesty ledger */
  supplied: string[];
  unknown: string[];
  /** Plain-language asks for the owner, in priority order. */
  needed: string[];
  prohibited: string[];
  /** 0–100: how much of the DNA rests on supplied facts rather than defaults. */
  confidence: number;
};

export type DnaFacts = {
  businessName?: string | null;
  industry?: string | null;
  services?: string[] | null;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  serviceArea?: string | null;
  phone?: string | null;
  email?: string | null;
  yearsInBusiness?: number | null;
  certifications?: string | null;
  awards?: string | null;
  testimonialCount?: number | null;
  reviewLink?: string | null;
  photoCount?: number | null;
  /** Real service prices, when the client entered them. */
  hasPrices?: boolean | null;
  bookableServices?: number | null;
  /** Website goals the client picked during onboarding. */
  goals?: string[] | null;
  conversionGoal?: string | null;
  hasHours?: boolean | null;
};

export const PROHIBITED_CLAIMS = [
  "reviews or ratings you didn't supply",
  "awards",
  "licences",
  "certifications",
  "statistics or percentages",
  "guarantees or warranties",
  "prices",
  "extra locations",
  "professional credentials",
  "customer quotes",
  "business milestones",
] as const;

/** Claim-shaped language that must never be generated from thin air. */
const CLAIM_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b\d{1,3}(\.\d)?[\s-]*(star|stars|\/\s*5)\b/i, reason: "star rating" },
  {
    pattern: /\b(award[- ]?winning|award winner|voted best|#\s?1\b|number one)\b/i,
    reason: "award",
  },
  { pattern: /\b(licen[cs]ed|certified|accredited|insured and bonded)\b/i, reason: "credential" },
  { pattern: /\b\d{1,3}\s?%/, reason: "statistic" },
  // A manufacturer's product warranty is the maker's promise, not the business's, so naming it is not a claim.
  { pattern: /\b(?<!manufacturer'?s?\s)(guarantee[d]?|warrant(y|ied)|money[- ]back)\b/i, reason: "guarantee" },
  {
    pattern: /\b\d{2,3}\+?\s*(five[- ]star|happy customers|clients served|reviews)\b/i,
    reason: "customer count",
  },
  // "leading" only as a market-position claim, not "leading you through the job".
  { pattern: /\b(cheapest|lowest price|best in|(?:industry|market)[- ]leading|the leading|a leading|award)\b/i, reason: "superlative claim" },
];

export type ClaimIssue = { text: string; reason: string };

/**
 * Screens generated copy for claims the client never supplied. Facts the client
 * did supply (awards, certifications, real testimonials) are allowed through.
 */
export function screenClaims(text: string, facts: DnaFacts): ClaimIssue[] {
  const allowCredentials = Boolean(facts.certifications?.trim());
  const allowAwards = Boolean(facts.awards?.trim());
  const allowRatings = (facts.testimonialCount ?? 0) > 0;
  const out: ClaimIssue[] = [];
  for (const { pattern, reason } of CLAIM_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (reason === "credential" && allowCredentials) continue;
    if (reason === "award" && allowAwards) continue;
    if ((reason === "star rating" || reason === "customer count") && allowRatings) continue;
    out.push({ text: match[0], reason });
  }
  return out;
}

const clean = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;

/** Builds the Business DNA. Same facts in, same DNA out. */
export function businessDna(facts: DnaFacts): BusinessDna {
  const name = clean(facts.businessName) ?? "This business";
  const industry = clean(facts.industry);
  const services = (facts.services ?? [])
    .map((service) => clean(service))
    .filter((service): service is string => Boolean(service))
    .slice(0, 24);
  const city = clean(facts.city);
  const region = clean(facts.region);
  const country = clean(facts.country);
  const serviceArea = clean(facts.serviceArea);
  const area = serviceArea ?? city;
  const hasPrices = facts.hasPrices === true;

  const supplied: string[] = [];
  const unknown: string[] = [];
  const needed: string[] = [];
  const mark = (label: string, present: boolean, ask?: string) => {
    if (present) supplied.push(label);
    else {
      unknown.push(label);
      if (ask) needed.push(ask);
    }
  };

  mark("business name", Boolean(clean(facts.businessName)), "Add your business name.");
  mark("industry", Boolean(industry), "Tell Revora what trade you're in.");
  mark("services", services.length > 0, "List the services you actually offer.");
  mark("service area", Boolean(area), "Add the town or area you cover.");
  mark("phone", Boolean(clean(facts.phone)), "Add the phone number customers should call.");
  mark("email", Boolean(clean(facts.email)), "Add the email that should receive enquiries.");
  mark("opening hours", facts.hasHours === true, "Set your opening hours.");
  mark("photos of real work", (facts.photoCount ?? 0) > 0, "Upload a few photos of your own work.");
  mark(
    "customer reviews",
    (facts.testimonialCount ?? 0) > 0 || Boolean(clean(facts.reviewLink)),
    "Add real reviews, or a link to where customers leave them.",
  );
  mark("pricing", hasPrices, "Add starting prices, or leave pricing to quotes.");

  const goals = (facts.goals ?? [])
    .map((goal) => clean(goal))
    .filter((g): g is string => Boolean(g));
  const desiredAction = clean(facts.conversionGoal) ?? goals[0] ?? "";

  const total = supplied.length + unknown.length;
  const confidence = total ? Math.round((supplied.length / total) * 100) : 0;

  return {
    name,
    industry,
    subIndustry: services[0] ?? null,
    services,
    city,
    region,
    country,
    serviceArea,
    phone: clean(facts.phone),
    email: clean(facts.email),
    desiredAction,
    supplied,
    unknown,
    needed: needed.slice(0, 6),
    prohibited: [...PROHIBITED_CLAIMS],
    confidence,
  };
}

const GENERIC_VALUE_PROPS = ["clear written quotes before work starts", "easy to reach", "tidy, respectful work", "straight answers"];
const CATEGORY_VALUE_PROPS: Record<string, string[]> = {
  plumbing: ["upfront quotes before any work", "clean, careful work in your home", "clear explanations of the fix"],
  hvac: ["honest repair-or-replace advice", "comfort through every season", "clear options before work starts"],
  roofing: ["a thorough inspection before any quote", "clear photos of what we find", "a tidy site at the end of the job"],
  "auto-detailing": ["careful hand work", "products chosen for your finish", "attention to the details others miss"],
  cleaning: ["a consistent checklist every visit", "flexible scheduling", "respect for your home"],
  "pressure-washing": ["the right pressure for each surface", "a visible before and after", "careful around plants and paint"],
  landscaping: ["designs suited to your yard", "reliable seasonal care", "a clean finish every visit"],
  restaurants: ["food made with care", "a warm welcome", "easy reservations"],
  "salons-barbers": ["a consultation before every cut", "unhurried appointments", "advice you can use at home"],
  "med-spa": ["a consultation before any treatment", "treatment plans tailored to you", "a calm, private setting"],
  dentist: ["gentle, unhurried care", "clear treatment options and costs explained", "a calm visit from start to finish"],
  "gyms-fitness": ["coaching for every level", "a welcoming community", "a plan you can follow"],
  "law-firms": ["a clear explanation of your options", "prompt replies to your questions", "plain-English advice"],
  "real-estate": ["local market knowledge", "clear communication at every step", "honest pricing advice"],
};

/**
 * Category-standard, non-specific value props a site in this trade may use without the owner stating them:
 * ways of working every decent business in the trade can honestly describe. No numbers, credentials,
 * guarantees, awards, reviews or response times.
 */
export function categoryValueProps(industry: string | null | undefined): string[] {
  const key = industry ? playbookFor(industry)?.key : undefined;
  return [...(key && CATEGORY_VALUE_PROPS[key] ? CATEGORY_VALUE_PROPS[key] : []), ...GENERIC_VALUE_PROPS];
}

/** Compact, prompt-safe rendering of the DNA for AI passes. */
export function dnaBrief(dna: BusinessDna): string {
  const lines = [
    `BUSINESS: ${dna.name}`,
    `TRADE: ${dna.industry ?? "unstated"}`,
    `SERVICES: ${dna.services.length ? dna.services.join(", ") : "unstated"}`,
    `AREA: ${dna.serviceArea ?? dna.city ?? "unstated"}`,
    `OWNER CONVERSION GOAL: ${dna.desiredAction || "unstated"}`,
    `SUPPLIED FACTS: ${dna.supplied.length ? dna.supplied.join(", ") : "none"}`,
    `UNKNOWN — never guess: ${dna.unknown.length ? dna.unknown.join(", ") : "none"}`,
    `NEVER CLAIM: ${dna.prohibited.join(", ")}`,
    `CATEGORY-STANDARD (non-specific, may be used in your own words): ${categoryValueProps(dna.industry).join("; ")}`,
  ];
  return lines.join("\n");
}
