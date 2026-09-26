/**
 * Central search-intent intelligence for Revora's own public pages.
 *
 * One place decides, for every public URL:
 *  - which search intent it serves (commercial, transactional, informational,
 *    local, industry, comparison, navigational, brand),
 *  - the primary non-branded query it is genuinely the best answer for,
 *  - whether it carries enough unique value to deserve indexing.
 *
 * Nothing here invents facts. Titles, descriptions and content measurements are
 * derived from the same data the pages render, so the audit and the sitemap can
 * never disagree with what a visitor actually sees.
 */

import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { US_STATES } from "@/lib/us-states";
import { NC_LOCATIONS } from "@/lib/business-identity";
import { LOCAL_INDUSTRIES, localPageContent, localPath } from "@/lib/local-pages";
import { GUIDES } from "@/lib/guides";
import { COMPARISONS } from "@/lib/compare";
import { CRM_SOLUTIONS } from "@/lib/crm-solutions";

export type SearchIntent =
  | "commercial"
  | "transactional"
  | "informational"
  | "local"
  | "industry"
  | "comparison"
  | "navigational"
  | "brand";

export interface SeoPage {
  path: string;
  intent: SearchIntent;
  /** The non-branded query this page is written to answer. */
  primaryQuery: string;
  title: string;
  description: string;
  /** Approximate unique body words the page renders from its own data. */
  words: number;
  /** False when the page is deliberately kept out of search. */
  indexable: boolean;
}

/**
 * Qualified non-branded demand Revora competes for. Used to keep page copy and
 * metadata pointed at commercial searches instead of brand terms.
 */
export const PRIORITY_QUERIES = [
  "ai website builder for small business",
  "small business growth software",
  "local seo software",
  "contractor lead generation",
  "service business crm",
  "booking software for service businesses",
  "quote software for contractors",
  "review management software",
  "ai marketing for local business",
  "automated customer follow-up software",
] as const;

/** Private surfaces that must never appear in search or in the sitemap. */
const PRIVATE_PREFIXES = [
  "/app",
  "/admin",
  "/my",
  "/onboarding",
  "/auth",
  "/reset-password",
  "/invite",
  "/p/",
  "/s/",
  "/api",
  "/_serverFn",
];

export function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Intent classification for any public Revora path. */
export function classifyIntent(path: string): SearchIntent {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return "brand";
  if (/^\/(get-started|pricing|portal|contact)/.test(p)) return "transactional";
  if (/^\/compare/.test(p)) return "comparison";
  if (/^\/guides/.test(p)) return "informational";
  if (/^\/(local|locations|states)/.test(p)) return "local";
  if (/^\/industries/.test(p)) return "industry";
  if (/^\/(crm|crm-for-contractors|website-audit|growth-assessment|tools|demo)/.test(p))
    return "commercial";
  if (/^\/(about|privacy|terms|share)/.test(p)) return "navigational";
  return "commercial";
}

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Thin-content gate. A page only earns indexing when it renders substantial,
 * page-specific material — never because a URL pattern exists.
 */
export interface ValueInput {
  words: number;
  sections: number;
  faqs: number;
  internalLinks: number;
}

export const MIN_INDEXABLE_WORDS = 320;

export function hasIndexableValue(input: ValueInput) {
  return (
    input.words >= MIN_INDEXABLE_WORDS &&
    input.sections >= 3 &&
    input.faqs >= 3 &&
    input.internalLinks >= 2
  );
}

function page(
  path: string,
  primaryQuery: string,
  title: string,
  description: string,
  words: number,
  indexable = true,
): SeoPage {
  return { path, intent: classifyIntent(path), primaryQuery, title, description, words, indexable };
}

/**
 * Every public marketing page Revora publishes, with the metadata and content
 * volume the page actually has. This is the single inventory used by the
 * sitemap and by the automated SEO audit.
 */
export function seoInventory(): SeoPage[] {
  const pages: SeoPage[] = [
    page(
      "/",
      "ai growth software for local business",
      "Revora — AI Growth Software That Books Local Jobs 24/7",
      "AI growth software for businesses in every industry: lead-generating website, instant quotes, online booking, CRM, automated follow-up, review requests, local SEO and analytics in one system.",
      900,
    ),
    page(
      "/pricing",
      "small business growth software pricing",
      "Pricing — Revora growth system",
      "What the Revora growth system costs: one-time setup, first month free, then a flat monthly platform fee. Cancel anytime.",
      600,
    ),
    page(
      "/get-started",
      "start service business crm free",
      "Get started — Revora",
      "Start your Revora growth system: answer a few questions about your services and service area and get your site, CRM and booking live.",
      420,
    ),
    page(
      "/crm-for-contractors",
      "service business crm",
      "CRM for contractors — leads, quotes, booking and follow-up",
      "A CRM built for contractors: every lead in one pipeline, instant quotes, online booking, automatic follow-up and review requests.",
      800,
    ),
    page(
      "/crm",
      "crm software for service businesses",
      "CRM software for service businesses by trade",
      "CRM, quoting, booking and follow-up software for electricians, plumbers, roofers, HVAC, construction and home-service businesses.",
      600,
    ),
    page(
      "/website-audit",
      "free local business website audit",
      "Free website audit for local businesses",
      "Check whether your website captures leads: speed, mobile experience, local search signals, quoting and follow-up.",
      520,
    ),
    page(
      "/growth-assessment",
      "small business growth assessment",
      "Growth assessment — find where leads leak",
      "Answer a short set of questions and see where your business loses leads between search, enquiry, quote and booked job.",
      480,
    ),
    page(
      "/tools",
      "lead value calculator for service business",
      "Free tools for service businesses",
      "Free calculators for service businesses: what a lead is worth, what missed calls cost and what follow-up recovers.",
      420,
    ),
    page(
      "/industries",
      "software by industry for local business",
      "Industries Revora builds growth systems for",
      "Growth systems by industry: HVAC, plumbing, roofing, cleaning, landscaping, detailing, beauty, fitness and more.",
      420,
    ),
    page(
      "/local",
      "local seo software by state",
      "Local growth systems by trade and state",
      "Local websites, lead capture and CRM by trade and US state, with real service-area content instead of thin location pages.",
      380,
    ),
    page(
      "/locations",
      "local business marketing near me",
      "Locations Revora serves",
      "The communities Revora serves, with the same growth system in every one.",
      340,
    ),
    page(
      "/states",
      "local seo software by state",
      "States Revora serves",
      "Revora serves local businesses in every US state, remotely, with local search content built from real geography.",
      340,
    ),
    page(
      "/guides",
      "local business marketing guides",
      "Guides for local business owners",
      "Practical guides on reviews, local SEO, lead follow-up, quoting and booking for local service businesses.",
      340,
    ),
    page(
      "/compare",
      "revora vs alternatives",
      "Compare Revora with the alternatives",
      "How Revora compares to website builders, agencies, standalone CRMs and doing it yourself.",
      360,
    ),
    page("/about", "about revora", "About Revora", "Who builds Revora and why it exists.", 320),
    page(
      "/contact",
      "contact revora",
      "Contact Revora",
      "Talk to Revora about your business.",
      220,
    ),
    // Private client entry point: shareable, but never a search result.
    page(
      "/portal",
      "revora client portal",
      "Client portal — Revora",
      "Sign in to your Revora workspace and client portal.",
      160,
      false,
    ),

    page(
      "/privacy",
      "revora privacy policy",
      "Privacy policy — Revora",
      "How Revora handles your data.",
      500,
    ),
    page(
      "/terms",
      "revora terms of service",
      "Terms of service — Revora",
      "The terms that apply to Revora's services.",
      500,
    ),
    // Deliberately excluded from search: a share helper and interactive demos
    // are not answers to a search query.
    page("/share", "", "Share Revora", "Share Revora with another business owner.", 90, false),
    page("/demo", "", "Revora demo", "An interactive demo of the Revora system.", 150, false),
    page(
      "/demo/dashboard",
      "",
      "Revora demo dashboard",
      "An interactive demo dashboard.",
      150,
      false,
    ),
  ];

  for (const industry of INDUSTRIES) {
    const slug = industrySlug(industry.name);
    const name = industry.name.toLowerCase();
    pages.push(
      page(
        `/industries/${slug}`,
        `${name} lead generation software`,
        `Websites & lead generation for ${industry.name} — Revora`,
        `Revora builds ${industry.name} businesses a website that captures leads, sends instant quotes, books jobs online and automates follow-up.`,
        620,
      ),
    );
  }

  for (const location of NC_LOCATIONS) {
    pages.push(
      page(
        `/locations/${location.slug}`,
        `local business website design ${location.city.toLowerCase()}`,
        `${location.city} website design & lead generation — Revora`,
        `Revora builds ${location.city} businesses a website with instant quotes, online booking, CRM and automatic follow-up, serving ${location.county}.`,
        420,
      ),
    );
  }

  for (const state of US_STATES) {
    pages.push(
      page(
        `/states/${state.slug}`,
        `local business marketing software ${state.name.toLowerCase()}`,
        `${state.name} local business growth systems — Revora`,
        `Revora serves ${state.name} local businesses with websites, lead capture, quoting, booking and follow-up.`,
        420,
      ),
    );
  }

  for (const industry of LOCAL_INDUSTRIES) {
    pages.push(
      page(
        localPath(industry.slug),
        `${industry.name.toLowerCase()} lead generation by state`,
        `${industry.name} growth systems by state — Revora`,
        `${industry.name} websites, instant quotes, booking and CRM, state by state.`,
        400,
      ),
    );
    for (const state of US_STATES) {
      const content = localPageContent(industry.slug, state.slug);
      if (!content) continue;
      const words =
        countWords(content.intro) +
        countWords(content.metroLine) +
        content.sections.reduce((sum, s) => sum + countWords(s.title) + countWords(s.body), 0) +
        content.faqs.reduce((sum, f) => sum + countWords(f.q) + countWords(f.a), 0);
      pages.push(
        page(
          content.path,
          `${industry.name.toLowerCase()} lead generation ${state.name.toLowerCase()}`,
          content.title,
          content.description,
          words,
          // Trade x state combinations are generated from one template, so they
          // are near-duplicates of each other and of the trade hub. They stay
          // live for visitors but are canonicalised to the trade hub and kept
          // out of the sitemap, so crawl budget goes to pages with unique value.
          false,
        ),
      );
    }
  }

  for (const guide of GUIDES) {
    const words =
      countWords(guide.intro) +
      countWords(guide.takeaway) +
      guide.steps.reduce((sum, s) => sum + countWords(s.title) + countWords(s.body), 0) +
      guide.faqs.reduce((sum, f) => sum + countWords(f.q) + countWords(f.a), 0);
    pages.push(
      page(
        `/guides/${guide.slug}`,
        guide.title.toLowerCase(),
        guide.metaTitle,
        guide.description,
        words,
      ),
    );
  }

  for (const comparison of COMPARISONS) {
    pages.push(
      page(
        `/compare/${comparison.slug}`,
        `revora vs ${comparison.slug.replace(/-/g, " ")}`,
        comparison.title,
        comparison.description,
        520,
      ),
    );
  }

  for (const solution of CRM_SOLUTIONS) {
    pages.push(
      page(
        `/crm/${solution.slug}`,
        `crm for ${solution.slug.replace(/-/g, " ")}`,
        solution.metaTitle,
        solution.description,
        700,
      ),
    );
  }

  return pages.filter((p) => !isPrivatePath(p.path));
}

/** Canonical, indexable, valuable URLs — exactly what belongs in the sitemap. */
export function indexablePlatformPaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const p of seoInventory()) {
    if (!p.indexable) continue;
    const path = p.path === "/" ? "" : p.path;
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/** Paths that exist publicly but are intentionally kept out of search. */
export function noindexPlatformPaths(): string[] {
  return seoInventory()
    .filter((p) => !p.indexable)
    .map((p) => p.path);
}
