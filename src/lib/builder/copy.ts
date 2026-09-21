/**
 * REVORA COPY INTELLIGENCE ENGINE — MASTER EDITION
 *
 * File:
 *   src/lib/builder/copy.ts
 *
 * PURPOSE
 * -------
 * Deterministic, fact-safe website copy generation for the Revora builder.
 *
 * DESIGN RULES
 * ------------
 * 1. Never invent reviews, ratings, awards, years in business, customers,
 *    guarantees, locations, certifications, statistics, prices, hours,
 *    phone numbers, emails, testimonials, or business results.
 *
 * 2. Prefer the business facts already stored in the workspace.
 *
 * 3. If a fact is missing, use safe language instead of fabricating it.
 *
 * 4. Copy should be conversion-focused without making unsupported claims.
 *
 * 5. Industry intelligence comes from IndustryPlaybook.
 *
 * 6. No network calls.
 *
 * 7. No paid AI provider.
 *
 * 8. No dependency on Supabase, Stripe, authentication, publishing,
 *    Cloudflare, or any other infrastructure.
 *
 * 9. Keep all functions pure and deterministic.
 *
 * 10. Existing public exports are preserved for compatibility with the
 *     deterministic builder and other builder modules.
 */

import type { IndustryPlaybook } from "./industry";
import {
  depthIsFactSafe,
  objectionBlock,
  processBlock,
  questionDepth,
  type DepthFacts,
} from "./copy-depth";


/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type CopyFacts = {
  name: string | null;
  industry: string | null;
  tagline: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;

  services: Array<{
    name: string;
  }>;
};

export type SectionCopy = {
  heading: string;
  subheading: string;
  /** Omitted (rather than empty) when there is no real content to write. */
  body: string | undefined;
};

/**
 * The generic fallback copy is always fully populated in every field — it is
 * only at the public boundary that an empty body becomes an omitted one.
 */
type GenericSectionCopy = {
  heading: string;
  subheading: string;
  body: string;
};

export type PageSeo = {
  seo_title: string;
  seo_description: string;
};

export type CtaTarget = {
  url: string;
  label: string;
};

export type CopyTone =
  | "professional"
  | "modern"
  | "friendly"
  | "premium"
  | "direct";

export type CopyLength =
  | "short"
  | "standard"
  | "expanded";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 160;
const MAX_TAGLINE_LENGTH = 120;
const MAX_SERVICE_NAME_LENGTH = 80;

const FALLBACK_BUSINESS =
  "your business";

const FALLBACK_INDUSTRY =
  "local business";

/* -------------------------------------------------------------------------- */
/* Basic utilities                                                            */
/* -------------------------------------------------------------------------- */

function clean(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value: unknown): string {
  return clean(value).toLowerCase();
}

function truncate(
  value: string,
  max: number,
): string {
  const text = clean(value);

  if (text.length <= max) {
    return text;
  }

  const shortened =
    text
      .slice(0, max - 1)
      .replace(/\s+\S*$/, "")
      .trim();

  return `${shortened}…`;
}

function unique(
  values: string[],
): string[] {
  return [
    ...new Set(
      values
        .map(clean)
        .filter(Boolean),
    ),
  ];
}

function firstNonEmpty(
  ...values: unknown[]
): string {
  for (const value of values) {
    const result = clean(value);

    if (result) {
      return result;
    }
  }

  return "";
}

function hasValue(
  value: unknown,
): boolean {
  return Boolean(clean(value));
}

/**
 * Type-safe accessors for optional playbook fields.
 *
 * `IndustryPlaybook` is declared with a `readonly [key: string]: unknown`
 * index signature, so IDE-style property access fails TypeScript's
 * "index signature" rules. These helpers read the indexed value and cast it
 * to the shape that consumes it.
 */

function playbookText(
  playbook: IndustryPlaybook,
  key: string,
): string {
  const value =
    (playbook as Record<
      string,
      unknown
    >)[key];

  return typeof value === "string"
    ? value
    : "";
}

function playbookTextArray(
  playbook: IndustryPlaybook,
  key: string,
): string[] {
  const value =
    (playbook as Record<
      string,
      unknown
    >)[key];

  return Array.isArray(value)
    ? value.filter(
        (
          item,
        ): item is string =>
          typeof item === "string",
      )
    : [];
}

type PlaybookSectionCopy = {
  heading?: unknown;
  subheading?: unknown;
  body?: unknown;
};

function textOf(
  value: unknown,
): string {
  return typeof value === "string"
    ? value
    : "";
}

/**
 * An empty generated body is semantically "this field has no content", not a
 * real sentence. Normalise it to `undefined` so callers never render an empty
 * paragraph or treat it as a change to apply.
 */
const omitIfEmpty = (
  value: string,
): string | undefined =>
  value.trim().length > 0
    ? value
    : undefined;

/**
 * True when the business has any usable fact to write about. When nothing is
 * supplied — no name, industry, description, location or services — the copy
 * engine omits filler sentences instead of inventing them, so a blank site
 * never gets a confident-sounding paragraph about nothing.
 */
function hasFacts(
  facts: CopyFacts,
): boolean {
  const normalized =
    normalizeFacts(facts);

  return Boolean(
    normalized.name ||
      normalized.industry ||
      normalized.description ||
      normalized.city ||
      normalized.serviceArea ||
      normalized.services.length,
  );
}

function playbookSection(
  playbook: IndustryPlaybook,
  kind: string,
): PlaybookSectionCopy {
  const value =
    (playbook as Record<
      string,
      unknown
    >)["sections"];

  if (
    !value ||
    typeof value !== "object"
  ) {
    return {};
  }

  const sections =
    value as Record<
      string,
      unknown
    >;

  const section =
    sections[lower(kind)];

  if (
    !section ||
    typeof section !== "object"
  ) {
    return {};
  }

  return section as PlaybookSectionCopy;
}

/* -------------------------------------------------------------------------- */
/* Fact normalization                                                         */
/* -------------------------------------------------------------------------- */

type NormalizedFacts = {
  name: string;
  industry: string;
  tagline: string;
  description: string;
  city: string;
  state: string;
  serviceArea: string;
  phone: string;
  email: string;

  services: Array<{
    name: string;
  }>;
};

/**
 * Keep business facts safe and predictable before using them in copy.
 */
function normalizeFacts(
  facts: CopyFacts,
): NormalizedFacts {
  return {
    name:
      truncate(
        clean(facts.name),
        120,
      ),

    industry:
      truncate(
        clean(facts.industry),
        100,
      ),

    tagline:
      truncate(
        clean(facts.tagline),
        MAX_TAGLINE_LENGTH,
      ),

    description:
      clean(facts.description),

    city:
      truncate(
        clean(facts.city),
        80,
      ),

    state:
      truncate(
        clean(facts.state),
        80,
      ),

    serviceArea:
      truncate(
        clean(facts.serviceArea),
        160,
      ),

    phone:
      clean(facts.phone),

    email:
      clean(facts.email),

    services:
      unique(
        (facts.services ?? [])
          .map(
            (service) =>
              truncate(
                service?.name ?? "",
                MAX_SERVICE_NAME_LENGTH,
              ),
          ),
      ).map((name) => ({
        name,
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* Business descriptors                                                       */
/* -------------------------------------------------------------------------- */

export function businessDescriptor(
  facts: CopyFacts,
): string {
  const normalized =
    normalizeFacts(facts);

  return (
    normalized.name ||
    normalized.industry ||
    FALLBACK_BUSINESS
  );
}

/* -------------------------------------------------------------------------- */
/* Location                                                                   */
/* -------------------------------------------------------------------------- */

export function place(
  facts: CopyFacts,
): string {
  const normalized =
    normalizeFacts(facts);

  if (
    normalized.serviceArea
  ) {
    return normalized.serviceArea;
  }

  const parts = [
    normalized.city,
    normalized.state,
  ].filter(Boolean);

  return parts.join(", ");
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export function serviceNames(
  facts: CopyFacts,
): string[] {
  return unique(
    normalizeFacts(facts)
      .services
      .map(
        (service) =>
          service.name,
      ),
  );
}

function serviceSentence(
  facts: CopyFacts,
): string {
  const services =
    serviceNames(facts);

  if (services.length === 0) {
    return "";
  }

  if (services.length === 1) {
    return services[0] ?? "";
  }

  if (services.length === 2) {
    return `${services[0] ?? ""} and ${services[1] ?? ""}`;
  }

  const visible =
    services.slice(0, 3);

  const last =
    visible[visible.length - 1] ??
    "";

  return `${visible
    .slice(0, -1)
    .join(", ")}, and ${last}`;
}

/* -------------------------------------------------------------------------- */
/* First sentence                                                             */
/* -------------------------------------------------------------------------- */

export function firstSentence(
  facts: CopyFacts,
): string {
  const normalized =
    normalizeFacts(facts);

  const description =
    normalized.description;

  if (!description) {
    return "";
  }

  const sentence =
    description
      .split(
        /(?<=[.!?])\s+/,
      )[0]
      ?.trim() ?? "";

  return truncate(
    sentence || description,
    240,
  );
}

/* -------------------------------------------------------------------------- */
/* Industry helpers                                                           */
/* -------------------------------------------------------------------------- */

function industryName(
  facts: CopyFacts,
): string {
  const normalized =
    normalizeFacts(facts);

  return (
    normalized.industry ||
    FALLBACK_INDUSTRY
  );
}

function industryLabel(
  facts: CopyFacts,
): string {
  const industry =
    industryName(facts);

  return industry
    .replace(
      /\b(services?|company|business|solutions?)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim() || industry;
}

/* -------------------------------------------------------------------------- */
/* Hero copy                                                                  */
/* -------------------------------------------------------------------------- */

export function heroHeadline(
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): string {
  const normalized =
    normalizeFacts(facts);

  const name =
    normalized.name ||
    FALLBACK_BUSINESS;

  const tagline =
    normalized.tagline;

  /**
   * If the owner supplied a tagline, preserve its meaning rather than
   * overwriting it with a generic AI slogan.
   */
  if (tagline) {
    return truncate(
      tagline,
      92,
    );
  }

  const headline =
    firstNonEmpty(
      playbookText(
        playbook,
        "heroHeadline",
      ),
      `A better way to ${industryLabel(
        facts,
      )}`,
      `Professional ${industryLabel(
        facts,
      )} for your next project`,
      `${name} is ready to help`,
    );

  return truncate(
    headline,
    92,
  );
}

export function heroSubheadline(
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): string {
  const normalized =
    normalizeFacts(facts);

  const description =
    firstSentence(
      normalized,
    );

  if (description) {
    return truncate(
      description,
      220,
    );
  }

  const services =
    serviceSentence(
      normalized,
    );

  if (services) {
    return truncate(
      `${businessDescriptor(
        normalized,
      )} provides ${services}.`,
      220,
    );
  }

  const location =
    place(normalized);

  if (location) {
    return truncate(
      `${businessDescriptor(
        normalized,
      )} serving ${location}.`,
      220,
    );
  }

  return truncate(
    firstNonEmpty(
      playbookText(
        playbook,
        "heroSubheadline",
      ),
      `Explore the services and solutions available from ${businessDescriptor(
        normalized,
      )}.`,
    ),
    220,
  );
}

/* -------------------------------------------------------------------------- */
/* CTA intelligence                                                           */
/* -------------------------------------------------------------------------- */

function isValidEmail(
  email: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

function hasUsablePhone(
  phone: string,
): boolean {
  const digits =
    phone.replace(
      /\D/g,
      "",
    );

  return (
    digits.length >= 7
  );
}

function hasInternalContactRoute(
  facts: CopyFacts,
): boolean {
  /**
   * `/contact` is a safe internal destination because the site engine owns
   * internal routes.
   */
  return true;
}

export function ctaTarget(
  facts: CopyFacts,
): CtaTarget | null {
  const normalized =
    normalizeFacts(facts);

  if (
    hasUsablePhone(
      normalized.phone,
    )
  ) {
    return {
      url: `tel:${normalized.phone.replace(
        /[^+\d]/g,
        "",
      )}`,
      label: "Call now",
    };
  }

  if (
    isValidEmail(
      normalized.email,
    )
  ) {
    return {
      url: `mailto:${normalized.email}`,
      label: "Email us",
    };
  }

  if (
    hasInternalContactRoute(
      normalized,
    )
  ) {
    return {
      url: "/contact",
      label: "Get started",
    };
  }

  return null;
}

export function nextStep(
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): string {
  const target =
    ctaTarget(facts);

  if (
    target?.label
  ) {
    return target.label;
  }

  return firstNonEmpty(
    playbook.ctaLabels?.primary,
    "Get started",
  );
}

/* -------------------------------------------------------------------------- */
/* Section copy                                                               */
/* -------------------------------------------------------------------------- */

function genericSectionCopy(
  kind: string,
  facts: CopyFacts,
): GenericSectionCopy {
  const business =
    businessDescriptor(facts);

  const services =
    serviceNames(facts);

  const location =
    place(facts);

  switch (
    lower(kind)
  ) {
    case "hero":
      return {
        heading:
          heroHeadline(
            facts,
            {} as IndustryPlaybook,
          ),
        subheading:
          heroSubheadline(
            facts,
            {} as IndustryPlaybook,
          ),
        body:
          firstSentence(facts),
      };

    case "intro":
      return {
        heading:
          `About ${business}`,
        subheading:
          location
            ? `Serving ${location}`
            : "",
        body:
          firstSentence(facts) ||
          (hasFacts(facts)
            ? `Learn more about ${business} and the services available to customers.`
            : ""),
      };

    case "services":
      return {
        heading:
          "Services",
        subheading:
          services.length
            ? `Explore what ${business} can help you with.`
            : `Explore what ${business} offers.`,
        body:
          services.length
            ? `Choose from ${services
                .slice(0, 3)
                .join(", ")} and other available services.`
            : `Explore the services available from ${business}.`,
      };

    case "benefits":
      return {
        heading:
          "Why choose this business",
        subheading:
          `A straightforward way to explore your options.`,
        body:
          firstSentence(facts) ||
          `Explore the services, information, and next steps available from ${business}.`,
      };

    case "area":
      return {
        heading:
          location
            ? `Serving ${location}`
            : "Service area",
        subheading:
          location
            ? `Local service information for ${location}.`
            : "See where service is available.",
        body:
          location
            ? `${business} serves customers in ${location}.`
            : `Contact ${business} to confirm service availability.`,
      };

    case "contact":
      return {
        heading:
          "Let's get started",
        subheading:
          `Connect with ${business}.`,
        body:
          `Reach out to discuss your needs and the next step.`,
      };

    case "booking":
      return {
        heading:
          "Book an appointment",
        subheading:
          `Choose the next step that works for you.`,
        body:
          `Start the process and connect with ${business}.`,
      };

    case "pricing":
      return {
        heading:
          "Pricing",
        subheading:
          `Explore available options.`,
        body:
          `Contact ${business} for current pricing and availability.`,
      };

    case "faq":
      return {
        heading:
          "Frequently asked questions",
        subheading:
          "Helpful answers before you get started.",
        body:
          `Find answers to common questions about working with ${business}.`,
      };

    case "gallery":
      return {
        heading:
          "Our work",
        subheading:
          `Explore available project photos.`,
        body:
          `Browse the work provided by ${business}.`,
      };

    case "reviews":
      return {
        heading:
          "Customer feedback",
        subheading:
          `Hear directly from customers.`,
        body:
          `Only published customer feedback should appear here.`,
      };

    case "cta":
    case "sticky_cta":
      return {
        heading:
          `Ready to get started?`,
        subheading:
          `Take the next step with ${business}.`,
        body:
          "",
      };

    default:
      return {
        heading:
          titleForSection(
            kind,
          ),
        subheading:
          "",
        body:
          firstSentence(facts) ||
          (hasFacts(facts)
            ? `Learn more about ${business}.`
            : ""),
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Section title intelligence                                                 */
/* -------------------------------------------------------------------------- */

function titleForSection(
  kind: string,
): string {
  const normalized =
    lower(kind);

  const titles: Record<
    string,
    string
  > = {
    hero: "Welcome",
    intro: "About",
    services: "Services",
    benefits: "Why choose us",
    area: "Service area",
    contact: "Contact",
    booking: "Book now",
    pricing: "Pricing",
    faq: "Frequently asked questions",
    gallery: "Our work",
    reviews: "Customer feedback",
    cta: "Get started",
    sticky_cta: "Get started",
    portfolio: "Our work",
    process: "How it works",
    team: "Our team",
    features: "Features",
    results: "What we offer",
  };

  if (
    titles[normalized]
  ) {
    return titles[normalized];
  }

  return normalized
    .replace(
      /[-_]+/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

/* -------------------------------------------------------------------------- */
/* Main section copy                                                          */
/* -------------------------------------------------------------------------- */

export function sectionCopy(
  kind: string,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): SectionCopy {
  const normalized =
    normalizeFacts(facts);

  const generic =
    genericSectionCopy(
      kind,
      normalized,
    );

  /**
   * Industry playbooks may provide explicit section language.
   *
   * We deliberately only consume values that exist.
   */
  const playbookSectionCopy =
    playbookSection(
      playbook,
      kind,
    );

  if (
    playbookSectionCopy &&
    Object.keys(
      playbookSectionCopy,
    ).length > 0
  ) {
    return {
      heading:
        truncate(
          firstNonEmpty(
            textOf(
              playbookSectionCopy.heading,
            ),
            generic.heading,
          ),
          140,
        ),

      subheading:
        truncate(
          firstNonEmpty(
            textOf(
              playbookSectionCopy.subheading,
            ),
            generic.subheading,
          ),
          220,
        ),

      body:
        omitIfEmpty(
          truncate(
            firstNonEmpty(
              textOf(
                playbookSectionCopy.body,
              ),
              generic.body,
            ),
            700,
          ),
        ),
    };
  }

  return withDepth(kind, normalized, playbook, {
    heading: truncate(generic.heading, 140),
    subheading: truncate(generic.subheading, 220),
    body: omitIfEmpty(truncate(generic.body, 700)),
  });
}

/**
 * Industry depth: for the sections where a thin line reads as filler, the body
 * is replaced with the industry depth layer's own wording. Only used when the
 * depth text passes the fact-safety net, so it can never introduce a claim.
 */
function withDepth(
  kind: string,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
  copy: SectionCopy,
): SectionCopy {
  const depthFacts: DepthFacts = {
    name: normalizeFacts(facts).name || null,
    city: normalizeFacts(facts).city || null,
    serviceArea: normalizeFacts(facts).serviceArea || null,
    services: [],
  };

  const block =
    kind === "faq"
      ? questionDepth(playbook, depthFacts)
      : kind === "process" || kind === "steps" || kind === "how_it_works"
        ? processBlock(playbook, depthFacts)
        : kind === "guarantee" || kind === "trust" || kind === "why_us"
          ? objectionBlock(playbook, depthFacts)
          : null;

  if (!block || !depthIsFactSafe(block)) return copy;

  const deeper = [...block.paragraphs, ...block.bullets].join(" ").trim();
  if (deeper.length <= (copy.body ?? "").length) return copy;

  return { ...copy, body: omitIfEmpty(truncate(deeper, 700)) };
}


/* -------------------------------------------------------------------------- */
/* FAQ intelligence                                                           */
/* -------------------------------------------------------------------------- */

/**
 * FAQ questions are safe to generate because they do not assert that an
 * answer, price, policy, certification, guarantee, or review exists.
 */
export function faqQuestions(
  playbook: IndustryPlaybook,
): string[] {
  const questions =
    playbookTextArray(
      playbook,
      "faqQuestions",
    );

  return unique(
    questions,
  ).slice(
    0,
    5,
  );
}

/* -------------------------------------------------------------------------- */
/* SEO                                                                        */
/* -------------------------------------------------------------------------- */

function seoLocation(
  facts: CopyFacts,
): string {
  const normalized =
    normalizeFacts(facts);

  return (
    normalized.serviceArea ||
    [
      normalized.city,
      normalized.state,
    ]
      .filter(Boolean)
      .join(", ")
  );
}

function seoBusinessName(
  facts: CopyFacts,
): string {
  return (
    normalizeFacts(facts)
      .name ||
    FALLBACK_BUSINESS
  );
}

function seoIndustry(
  facts: CopyFacts,
): string {
  return (
    industryLabel(facts) ||
    FALLBACK_INDUSTRY
  );
}

export function pageSeo(
  title: string,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): PageSeo {
  const normalized =
    normalizeFacts(facts);

  const business =
    seoBusinessName(
      normalized,
    );

  const industry =
    seoIndustry(
      normalized,
    );

  const location =
    seoLocation(
      normalized,
    );

  const pageTitle =
    clean(title) ||
    "Home";

  const isHome =
    lower(pageTitle) ===
      "home" ||
    lower(pageTitle) ===
      lower(business);

  let seoTitle = "";

  if (isHome) {
    seoTitle = location
      ? `${business} | ${industry} in ${location}`
      : `${business} | ${industry}`;
  } else {
    seoTitle = location
      ? `${pageTitle} | ${business} | ${location}`
      : `${pageTitle} | ${business}`;
  }

  /**
   * Prefer the business's own description when it exists.
   */
  let description =
    firstSentence(
      normalized,
    );

  if (!description) {
    description =
      location
        ? `${business} provides ${industry} services in ${location}. Explore services, information, and next steps.`
        : `${business} provides ${industry} services. Explore services, information, and next steps.`;
  }

  /**
   * Playbook metadata is a fallback, not a replacement for owner-provided
   * business information.
   */
  if (
    !description
  ) {
    description =
      playbookText(
        playbook,
        "seoDescription",
      );
  }

  return {
    seo_title:
      truncate(
        seoTitle,
        MAX_TITLE_LENGTH,
      ),

    seo_description:
      truncate(
        description,
        MAX_DESCRIPTION_LENGTH,
      ),
  };
}

/* -------------------------------------------------------------------------- */
/* Safe copy validation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * These patterns identify claims that should not be generated unless the
 * business has explicitly supplied the claim.
 */
const UNSUPPORTED_CLAIM_PATTERNS: RegExp[] = [
  /\b#1\b/i,
  /\bbest in\b/i,
  /\bnumber one\b/i,
  /\baward[- ]winning\b/i,
  /\baward winning\b/i,
  /\bguaranteed results?\b/i,
  /\b100%\s*(satisfaction|guaranteed)\b/i,
  /\btrusted by (thousands|hundreds|millions)\b/i,
  /\bover \d[\d,]* customers?\b/i,
  /\b\d[\d,]*\+ customers?\b/i,
  /\b\d[\d,]* years? (of )?experience\b/i,
  /\bserving customers since\b/i,
];

function containsUnsupportedClaim(
  text: string,
): boolean {
  return UNSUPPORTED_CLAIM_PATTERNS.some(
    (pattern) =>
      pattern.test(text),
  );
}

/**
 * Exposed internally for future quality tooling without introducing a
 * dependency on the quality engine.
 */
export function isCopyFactSafe(
  text: string,
): boolean {
  const value =
    clean(text);

  if (!value) {
    return true;
  }

  return !containsUnsupportedClaim(
    value,
  );
}

/* -------------------------------------------------------------------------- */
/* Fabrication-safe fallback                                                  */
/* -------------------------------------------------------------------------- */

function sanitizeGeneratedText(
  text: string,
  facts: CopyFacts,
): string {
  let value =
    clean(text);

  if (!value) {
    return "";
  }

  /**
   * We do not blindly delete unsupported claims because doing so could leave
   * broken grammar. If a playbook supplies an unsafe sentence, replace it
   * with fact-safe generic language.
   */
  if (
    containsUnsupportedClaim(
      value,
    )
  ) {
    return `Explore the services available from ${businessDescriptor(
      facts,
    )}.`;
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* Final copy contract                                                        */
/* -------------------------------------------------------------------------- */

export function safeSectionCopy(
  kind: string,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): SectionCopy {
  const copy =
    sectionCopy(
      kind,
      facts,
      playbook,
    );

  return {
    heading:
      sanitizeGeneratedText(
        copy.heading,
        facts,
      ),

    subheading:
      sanitizeGeneratedText(
        copy.subheading,
        facts,
      ),

    body:
      sanitizeGeneratedText(
        copy.body ?? "",
        facts,
      ),
  };
}

/* -------------------------------------------------------------------------- */
/* Intent-aware copy helpers                                                  */
/* -------------------------------------------------------------------------- */

export function serviceIntro(
  facts: CopyFacts,
): string {
  const business =
    businessDescriptor(
      facts,
    );

  const services =
    serviceSentence(
      facts,
    );

  if (services) {
    return `${business} offers ${services}.`;
  }

  return `Explore the services available from ${business}.`;
}

export function contactIntro(
  facts: CopyFacts,
): string {
  const business =
    businessDescriptor(
      facts,
    );

  return `Connect with ${business} to discuss your needs and the next step.`;
}

export function locationIntro(
  facts: CopyFacts,
): string {
  const business =
    businessDescriptor(
      facts,
    );

  const location =
    place(facts);

  if (location) {
    return `${business} serves customers in ${location}.`;
  }

  return `Contact ${business} to confirm service availability.`;
}

/* -------------------------------------------------------------------------- */
/* Tone helpers                                                               */
/* -------------------------------------------------------------------------- */

export function toneForIndustry(
  playbook: IndustryPlaybook,
): CopyTone {
  const label =
    lower(
      playbook.label,
    );

  if (
    /\bpremium|luxury|high[- ]end\b/.test(
      label,
    )
  ) {
    return "premium";
  }

  if (
    /\btech|technology|software|digital\b/.test(
      label,
    )
  ) {
    return "modern";
  }

  if (
    /\bhome|clean|care|beauty|salon|family\b/.test(
      label,
    )
  ) {
    return "friendly";
  }

  return "professional";
}

/* -------------------------------------------------------------------------- */
/* Deterministic rewrite                                                      */
/* -------------------------------------------------------------------------- */

/**
 * This is intentionally not an LLM.
 *
 * It performs a safe structural rewrite using facts already present in the
 * workspace. This gives the free builder useful "rewrite" behavior without
 * introducing a paid AI dependency.
 */
export function rewriteSectionCopy(
  kind: string,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
  length: CopyLength = "standard",
): SectionCopy {
  const copy =
    safeSectionCopy(
      kind,
      facts,
      playbook,
    );

  if (
    length === "short"
  ) {
    return {
      heading:
        copy.heading,

      subheading:
        truncate(
          copy.subheading,
          120,
        ),

      body:
        truncate(
          copy.body ?? "",
          300,
        ),
    };
  }

  if (
    length === "expanded"
  ) {
    const extra =
      serviceSentence(
        facts,
      );

    return {
      heading:
        copy.heading,

      subheading:
        copy.subheading,

      body:
        unique([
          copy.body ?? "",
          extra
            ? `Services include ${extra}.`
            : "",
        ]).join(" "),
    };
  }

  return copy;
}

/* -------------------------------------------------------------------------- */
/* Public diagnostics                                                         */
/* -------------------------------------------------------------------------- */

export function copySummary(
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): string {
  const normalized =
    normalizeFacts(facts);

  const services =
    serviceNames(
      normalized,
    );

  const location =
    place(normalized);

  const tone =
    toneForIndustry(
      playbook,
    );

  return [
    `business=${businessDescriptor(
      normalized,
    )}`,
    `industry=${industryName(
      normalized,
    )}`,
    `services=${services.length}`,
    `location=${location || "missing"}`,
    `contact=${
      normalized.phone ||
      normalized.email
        ? "available"
        : "missing"
    }`,
    `tone=${tone}`,
  ].join(" | ");
}

/* -------------------------------------------------------------------------- */
/* Compatibility exports                                                     */
/* -------------------------------------------------------------------------- */

/**
 * These aliases make the copy engine easier for future builder modules to
 * consume without forcing them to know internal helper names.
 */
export const getHeroHeadline =
  heroHeadline;

export const getHeroSubheadline =
  heroSubheadline;

export const getCtaTarget =
  ctaTarget;

export const getPageSeo =
  pageSeo;

export const getSectionCopy =
  sectionCopy;

export const getFaqQuestions =
  faqQuestions;

/* -------------------------------------------------------------------------- */
/* Invariants                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compile-time-facing sanity helpers.
 *
 * These do not touch the network or application state.
 */
export function hasBusinessIdentity(
  facts: CopyFacts,
): boolean {
  const normalized =
    normalizeFacts(facts);

  return Boolean(
    normalized.name ||
      normalized.industry,
  );
}

export function hasServiceInformation(
  facts: CopyFacts,
): boolean {
  return (
    serviceNames(facts)
      .length > 0
  );
}

export function hasContactInformation(
  facts: CopyFacts,
): boolean {
  const normalized =
    normalizeFacts(facts);

  return Boolean(
    hasUsablePhone(
      normalized.phone,
    ) ||
      isValidEmail(
        normalized.email,
      ),
  );
}