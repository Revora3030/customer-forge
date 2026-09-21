/**
 * TEMPLATE GALLERY
 * ================
 *
 * A browsable set of starting points, one per kind of website the builder knows
 * how to plan (see `site-archetypes.ts`). A template is *structure only*: which
 * pages exist, which blocks the home page carries, and what the site is trying
 * to get a visitor to do.
 *
 * It never contains business copy, claims, prices, reviews or photographs, so
 * choosing a template can never put a false statement on a site. Everything the
 * visitor reads still comes from the owner's own stored facts.
 *
 * Pure and deterministic: the same catalog, in the same order, every time.
 */

import { SITE_ARCHETYPES, type ArchetypeGoal, type SiteArchetype } from "@/lib/site-archetypes";

export type SiteTemplate = {
  id: string;
  name: string;
  /** One plain line the owner understands. */
  summary: string;
  goal: ArchetypeGoal;
  /** What the site is trying to achieve, in plain words. */
  goalLabel: string;
  /** Page titles, home first. */
  pages: string[];
  /** Home-page block names in reading order, in plain words. */
  homeBlocks: string[];
  /** Words that suggest this template fits a business. */
  keywords: string[];
};

const GOAL_LABEL: Record<ArchetypeGoal, string> = {
  quote: "Get people to ask for a price",
  book: "Get people to book a time",
  call: "Get people to call",
  visit: "Get people to come in",
  purchase: "Get people to buy",
  lead: "Collect enquiries",
  consult: "Get people to book a consultation",
};

/** Block kinds in plain English, so the gallery reads like a human wrote it. */
const BLOCK_LABEL: Record<string, string> = {
  hero: "Opening banner",
  trust_bar: "Reassurance strip",
  services: "What you do",
  service_detail: "Service details",
  features: "What makes you different",
  benefits: "Why people choose you",
  about: "About your business",
  process: "How it works",
  steps: "Step by step",
  gallery: "Photo gallery",
  team: "Your people",
  menu: "Menu",
  rooms: "Rooms",
  listings: "Listings",
  programs: "Programmes",
  classes: "Timetable",
  pricing: "Prices",
  plans: "Plans",
  testimonials: "What customers say",
  reviews: "What customers say",
  proof: "Proof of work",
  stats: "Key numbers",
  timeline: "History",
  faq: "Common questions",
  hours: "Opening times",
  areas: "Areas covered",
  area: "Areas covered",
  map: "Where to find you",
  guarantee: "Your promise",
  newsletter: "Email sign-up",
  blog: "Articles",
  posts: "Articles",
  quote: "Price request form",
  booking: "Booking form",
  contact: "Contact",
  cta: "Call to action",
  sticky_cta: "Always-visible button",
  intro: "Introduction",
  offer: "Your offer",
  emergency: "Urgent help",
  custom: "Custom block",
  content: "Written content",
  logos: "Brands you work with",
};

export function blockLabel(kind: string): string {
  return BLOCK_LABEL[kind] ?? kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function templateFor(archetype: SiteArchetype): SiteTemplate {
  const pages = ["Home", ...archetype.pages.map((page) => page.title), "Contact"];
  const homeBlocks = [
    "hero",
    "trust_bar",
    "services",
    ...archetype.homeSections.map((section) => section.kind),
    "faq",
    "cta",
    "contact",
  ];
  const seen = new Set<string>();
  const orderedBlocks = homeBlocks.filter((kind) => {
    if (seen.has(kind)) return false;
    seen.add(kind);
    return true;
  });

  return {
    id: archetype.id,
    name: archetype.name,
    summary: archetype.summary,
    goal: archetype.goal,
    goalLabel: GOAL_LABEL[archetype.goal],
    pages: pages.filter((title, index) => pages.indexOf(title) === index),
    homeBlocks: orderedBlocks.map(blockLabel),
    keywords: archetype.keywords.slice(0, 12),
  };
}

/** Every template the builder can start from, in a stable order. */
export const TEMPLATE_GALLERY: SiteTemplate[] = SITE_ARCHETYPES.map(templateFor);

export const templateById = (id: string | null | undefined): SiteTemplate | null =>
  TEMPLATE_GALLERY.find((template) => template.id === id) ?? null;

/** Free-text search over names, summaries and the words behind each template. */
export function searchTemplates(query: string | null | undefined, limit = 50): SiteTemplate[] {
  const clean = (query ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const capped = Math.max(1, Math.min(Math.trunc(limit) || 50, TEMPLATE_GALLERY.length));
  if (!clean) return TEMPLATE_GALLERY.slice(0, capped);

  const words = clean.split(/\s+/).filter(Boolean);
  const scored = TEMPLATE_GALLERY.map((template) => {
    const haystack = `${template.name} ${template.summary} ${template.keywords.join(" ")}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (template.name.toLowerCase().includes(word)) score += 3;
      else if (haystack.includes(word)) score += 1;
    }
    return { template, score };
  }).filter((row) => row.score > 0);

  scored.sort(
    (a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name),
  );
  return scored.slice(0, capped).map((row) => row.template);
}

/** Templates that suit a business, best match first; never empty. */
export function suggestTemplates(
  business: { industry?: string | null; description?: string | null; name?: string | null },
  limit = 3,
): SiteTemplate[] {
  const text = [business.industry, business.description, business.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const capped = Math.max(1, Math.min(Math.trunc(limit) || 3, TEMPLATE_GALLERY.length));
  if (!text.trim()) return TEMPLATE_GALLERY.slice(0, capped);

  const scored = TEMPLATE_GALLERY.map((template) => ({
    template,
    score: template.keywords.reduce((total, word) => (text.includes(word) ? total + 1 : total), 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name));
  return scored.slice(0, capped).map((row) => row.template);
}

/**
 * The instruction the builder acts on when an owner picks a template. It asks
 * for structure and for the site's own stored facts — never for invented copy.
 */
export function templateInstruction(template: SiteTemplate): string {
  return [
    `Build my website using the "${template.name}" layout.`,
    `Pages: ${template.pages.join(", ")}.`,
    `Home page blocks in this order: ${template.homeBlocks.join(", ")}.`,
    `The site's job is: ${template.goalLabel.toLowerCase()}.`,
    "Use only my saved business details, services and photos — do not invent any facts, prices, reviews or results.",
  ].join(" ");
}
