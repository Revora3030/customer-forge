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
  states: {
    path: "/states",
    anchor: "Growth systems in all 50 states",
    note: "The same complete system, wherever your business is.",
  },
  locations: {
    path: "/locations",
    anchor: "North Carolina cities we serve",
    note: "Charlotte, Raleigh, Greensboro and the rest of the state.",
  },
  about: {
    path: "/about",
    anchor: "Who builds Revora",
    note: "The team and the reason Revora exists.",
  },
  contact: {
    path: "/contact",
    anchor: "Talk to the Revora team",
    note: "Email or call with questions about your business.",
  },
  reviews: {
    path: "/guides/get-more-google-reviews",
    anchor: "How to get more Google reviews",
    note: "A policy-safe process that actually gets asked.",
  },
} satisfies Record<string, SeoLink>;

const FALLBACK: SeoLink[] = [L.pricing, L.crm];

// Each cluster's first four links are what a page renders by default. Every
// indexable hub appears in at least one cluster so it has a contextual
// inbound link (not only a footer link) and is never an orphan.
const CLUSTERS: Record<string, SeoLink[]> = {
  brand: [L.crm, L.local, L.pricing, L.audit],
  commercial: [L.industries, L.local, L.guides, L.assessment],
  transactional: [L.crm, L.compare, L.guides, L.audit],
  industry: [L.crm, L.local, L.reviews, L.pricing],
  local: [L.states, L.locations, L.industries, L.getStarted],
  informational: [L.crm, L.contractorCrm, L.tools, L.pricing],
  comparison: [L.pricing, L.about, L.crm, L.getStarted],
  navigational: [L.pricing, L.contact, L.about, L.crm],
};

/**
 * The contextual links a page should render, excluding itself.
 * Deterministic, so the audit sees exactly what the page renders.
 */
export function internalLinksFor(path: string, limit = 4): SeoLink[] {
  const intent = classifyIntent(path);
  const cluster = CLUSTERS[intent] ?? FALLBACK;
  return cluster.filter((link) => link.path !== path).slice(0, limit);
}
