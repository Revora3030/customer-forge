/**
 * Contextual internal linking.
 *
 * Search engines and AI systems understand a topic from how pages connect, so
 * every public page gets a small set of genuinely relevant next steps with
 * descriptive anchor text: industry → services → local → lead generation →
 * booking → quotes → reviews → CRM → pricing → conversion.
 *
 * Links are always real routes with real relevance. No link farms, no "see also"
 * blocks stuffed with unrelated URLs.
 */

import { classifyIntent } from "@/lib/seo-intent";

export interface SeoLink {
  path: string;
  /** Descriptive, natural anchor text — never "click here". */
  anchor: string;
  /** Why this is the useful next step, shown under the anchor. */
  note: string;
}

const L = {
  pricing: {
    path: "/pricing",
    anchor: "What the Revora growth system costs",
    note: "Setup, the free first month and the flat monthly platform fee.",
  },
  getStarted: {
    path: "/get-started",
    anchor: "Start your growth system",
    note: "Answer a few questions and get your site, quotes and booking live.",
  },
  crm: {
    path: "/crm",
    anchor: "CRM software for service businesses",
    note: "One pipeline from first enquiry to paid job, by trade.",
  },
  contractorCrm: {
    path: "/crm-for-contractors",
    anchor: "CRM for contractors",
    note: "Quotes, booking, follow-up and reviews for contracting work.",
  },
  local: {
    path: "/local",
    anchor: "Local growth systems by trade and state",
    note: "Local search content built from real service areas.",
  },
  industries: {
    path: "/industries",
    anchor: "Growth systems by industry",
    note: "How the system is set up for each trade.",
  },
  guides: {
    path: "/guides",
    anchor: "Guides for local business owners",
    note: "Reviews, local SEO, follow-up, quoting and booking, step by step.",
  },
  compare: {
    path: "/compare",
    anchor: "Compare Revora with the alternatives",
    note: "Agencies, website builders, standalone CRMs and DIY.",
  },
  audit: {
    path: "/website-audit",
    anchor: "Free website audit",
    note: "See whether your current site actually captures leads.",
  },
  assessment: {
    path: "/growth-assessment",
    anchor: "Growth assessment",
    note: "Find exactly where leads leak in your business.",
  },
  tools: {
    path: "/tools",
    anchor: "Free lead-value calculators",
    note: "What a lead, a missed call and follow-up are worth to you.",
  },
  reviews: {
    path: "/guides/get-more-google-reviews",
    anchor: "How to get more Google reviews",
    note: "A policy-safe process that actually gets asked.",
  },
  states: { path: "/states", anchor: "Business websites and CRM across all 50 states", note: "Browse real service areas and choose an industry workflow." },
  about: { path: "/about", anchor: "About Revora Growth Systems", note: "Our approach, the product and what to expect before launching." },
} satisfies Record<string, SeoLink>;

const FALLBACK: SeoLink[] = [L.pricing, L.crm];

const CLUSTERS: Record<string, SeoLink[]> = {
  brand: [L.crm, L.states, L.pricing, L.about],
  commercial: [L.industries, L.local, L.guides, L.pricing],
  transactional: [L.crm, L.compare, L.guides, L.audit],
  industry: [L.crm, L.local, L.reviews, L.pricing],
  local: [L.industries, L.crm, L.guides, L.getStarted],
  informational: [L.crm, L.contractorCrm, L.tools, L.pricing],
  comparison: [L.pricing, L.crm, L.guides, L.getStarted],
  navigational: [L.pricing, L.crm, L.guides],
};

/**
 * The contextual links a page should render, excluding itself.
 * Deterministic, so the audit sees exactly what the page renders.
 */
export function internalLinksFor(path: string, limit = 4): SeoLink[] {
  if (path === "/states") return [L.industries, L.local, L.pricing, L.about].slice(0, limit);
  if (path === "/about") return [L.pricing, L.compare, L.states, L.getStarted].slice(0, limit);
  const intent = classifyIntent(path);
  const cluster = CLUSTERS[intent] ?? FALLBACK;
  return cluster.filter((link) => link.path !== path).slice(0, limit);
}
