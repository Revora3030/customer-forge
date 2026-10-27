/**
 * Prospect finder: turns Google Places results into businesses that have no
 * real website of their own, ready for a demo build.
 *
 * Only public listing facts are used (name, category, address, phone). A
 * listing whose only "website" is a social profile or a directory page counts
 * as having no website. Closed businesses are dropped.
 */
import type { ProspectDemoInput } from "./jarvis-demo-site";

export const MAX_SEARCHES_PER_DAY = 40;

export type WebPresence = "none" | "social_only" | "has_website";

export type FoundProspect = {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  presence: WebPresence;
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
  /** Opening hours exactly as the listing states them ("Monday: 9 AM – 5 PM"). */
  hours?: string[];
  /** Google's own one-line summary of the business, when the listing has one. */
  summary?: string | null;
  /** Verified gaps on the business's own website (only set when it was checked). */
  siteGaps?: SiteGap[];
};

/** Checkable, factual gaps on an existing website. Never guessed. */
export const SITE_GAPS = ["not_mobile_friendly", "no_https", "no_online_booking_or_quote", "slow_to_load"] as const;
export type SiteGap = (typeof SITE_GAPS)[number];

export const SITE_GAP_LABELS: Record<SiteGap, string> = {
  not_mobile_friendly: "the site isn't set up for phones",
  no_https: "the site isn't secure (no https)",
  no_online_booking_or_quote: "there's no way to book or request a quote online",
  slow_to_load: "the homepage is slow to load",
};

export const SLOW_SITE_MS = 4_000;

/** Gaps found in a fetched homepage. Only things the HTML or the request proves. */
export function siteGaps(page: { html: string; finalUrl: string; loadMs: number }): SiteGap[] {
  const gaps: SiteGap[] = [];
  const html = page.html;
  if (!/<meta[^>]+name=["']?viewport["']?[^>]*>/i.test(html)) gaps.push("not_mobile_friendly");
  if (/^http:\/\//i.test(page.finalUrl)) gaps.push("no_https");
  const booking = /<form[\s>]|\b(book(ing)?|schedule|appointment|get a quote|free quote|request (a )?quote|estimate)\b|calendly|housecallpro|jobber|servicetitan|setmore|square\.site\/book/i;
  if (!booking.test(html)) gaps.push("no_online_booking_or_quote");
  if (page.loadMs > SLOW_SITE_MS) gaps.push("slow_to_load");
  return gaps;
}

/** A website weak enough to pitch an upgrade: not phone-ready, or two or more gaps. */
export function isUpgradeProspect(gaps: readonly SiteGap[] | undefined): boolean {
  if (!gaps?.length) return false;
  return gaps.includes("not_mobile_friendly") || gaps.length >= 2;
}

export function parseSiteGaps(value: unknown): SiteGap[] {
  if (!Array.isArray(value)) return [];
  return SITE_GAPS.filter((gap) => value.includes(gap));
}

const SOCIAL_OR_DIRECTORY =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|yelp\.com|nextdoor\.com|linktr\.ee|linkin\.bio|business\.site|sites\.google\.com|g\.page|google\.com|thumbtack\.com|angi\.com|homeadvisor\.com|houzz\.com|bbb\.org|yellowpages\.com|mapquest\.com|square\.site|wa\.me)$/i;

export function webPresence(website: string | null | undefined): WebPresence {
  const raw = (website ?? "").trim();
  if (!raw) return "none";
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
    return SOCIAL_OR_DIRECTORY.test(host) ? "social_only" : "has_website";
  } catch {
    return "none";
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function component(place: Record<string, unknown>, type: string, short = false): string | null {
  const parts = Array.isArray(place["addressComponents"]) ? (place["addressComponents"] as Record<string, unknown>[]) : [];
  const match = parts.find((part) => Array.isArray(part["types"]) && (part["types"] as unknown[]).includes(type));
  const value = text(match?.[short ? "shortText" : "longText"]);
  return value || null;
}

// Google tags every listing with these; they say nothing about the trade.
const GENERIC_TYPES = new Set(["point_of_interest", "establishment", "store", "service", "premise", "geocode", "street_address", "local_business"]);

/** "car_detailing_service" -> "Car detailing service". */
function humanType(type: string): string {
  const words = type.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The listing's category: Google's display name, else its most specific type tag. */
export function placeCategory(place: Record<string, unknown>): string | null {
  const display = text((place["primaryTypeDisplayName"] as { text?: unknown } | undefined)?.text);
  if (display) return display.slice(0, 80);
  const primary = text(place["primaryType"]);
  if (primary && !GENERIC_TYPES.has(primary)) return humanType(primary).slice(0, 80);
  const types = Array.isArray(place["types"]) ? (place["types"] as unknown[]) : [];
  const specific = types.find((type): type is string => typeof type === "string" && /^[a-z_]{3,60}$/.test(type) && !GENERIC_TYPES.has(type));
  return specific ? humanType(specific).slice(0, 80) : null;
}

export function normalizePlace(place: Record<string, unknown>): FoundProspect | null {
  const name = text((place["displayName"] as { text?: unknown } | undefined)?.text);
  const placeId = text(place["id"]);
  if (!name || !placeId) return null;
  if (text(place["businessStatus"]) && text(place["businessStatus"]) !== "OPERATIONAL") return null;
  const website = text(place["websiteUri"]) || null;
  return {
    placeId,
    name: name.slice(0, 120),
    category: placeCategory(place),
    address: text(place["formattedAddress"]) || null,
    city: component(place, "locality") ?? component(place, "postal_town") ?? component(place, "administrative_area_level_2"),
    state: component(place, "administrative_area_level_1", true),
    phone: text(place["nationalPhoneNumber"]) || null,
    website,
    presence: webPresence(website),
    rating: typeof place["rating"] === "number" ? place["rating"] : null,
    reviewCount: typeof place["userRatingCount"] === "number" ? place["userRatingCount"] : null,
    mapsUri: text(place["googleMapsUri"]) || null,
    ...listingExtras(place),
  };
}

function listingExtras(place: Record<string, unknown>): { hours?: string[]; summary?: string | null } {
  const raw = (place["regularOpeningHours"] as { weekdayDescriptions?: unknown } | undefined)?.weekdayDescriptions;
  const hours = Array.isArray(raw) ? raw.filter((line): line is string => typeof line === "string").map((line) => line.replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean).slice(0, 7) : [];
  const summary = text((place["editorialSummary"] as { text?: unknown } | undefined)?.text).slice(0, 300) || null;
  return { ...(hours.length ? { hours } : {}), ...(summary ? { summary } : {}) };
}

const normalName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (name: string, city: string | null) => `${normalName(name)}|${(city ?? "").toLowerCase()}`;

/**
 * Businesses without a real website that a demo can be built for (a city is
 * required), minus ones that already have a demo with the same name.
 */
export function selectProspects(
  places: Record<string, unknown>[],
  existingNames: string[] = [],
  options: { includeWebsites?: boolean } = {},
): FoundProspect[] {
  const taken = new Set(existingNames.map(normalName));
  const seen = new Set<string>();
  const out: FoundProspect[] = [];
  for (const place of places) {
    const prospect = normalizePlace(place);
    if (!prospect || !prospect.city) continue;
    if (prospect.presence === "has_website" && !options.includeWebsites) continue;
    const id = key(prospect.name, prospect.city);
    if (seen.has(prospect.placeId) || seen.has(id) || taken.has(normalName(prospect.name))) continue;
    seen.add(prospect.placeId);
    seen.add(id);
    out.push(prospect);
  }
  return out;
}

/**
 * The demo build request for a found business. The description states only
 * the public category and area; services stay empty so nothing is invented.
 */
export function prospectDemoInput(prospect: FoundProspect, niche: string, publicEmail: string | null = null): ProspectDemoInput {
  const industry = (prospect.category || niche).slice(0, 80);
  const area = [prospect.city, prospect.state].filter(Boolean).join(", ");
  return {
    businessName: prospect.name,
    industry,
    city: prospect.city ?? "",
    state: prospect.state,
    phone: prospect.phone,
    email: publicEmail,
    description: `${industry} serving ${area || "the local area"}.`.slice(0, 600),
    services: [],
    placeId: prospect.placeId,
    ...(prospect.siteGaps?.length ? { siteGaps: prospect.siteGaps } : {}),
  };
}
