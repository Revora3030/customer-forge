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
};

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

export function normalizePlace(place: Record<string, unknown>): FoundProspect | null {
  const name = text((place["displayName"] as { text?: unknown } | undefined)?.text);
  const placeId = text(place["id"]);
  if (!name || !placeId) return null;
  if (text(place["businessStatus"]) && text(place["businessStatus"]) !== "OPERATIONAL") return null;
  const website = text(place["websiteUri"]) || null;
  return {
    placeId,
    name: name.slice(0, 120),
    category: text((place["primaryTypeDisplayName"] as { text?: unknown } | undefined)?.text) || null,
    address: text(place["formattedAddress"]) || null,
    city: component(place, "locality") ?? component(place, "postal_town") ?? component(place, "administrative_area_level_2"),
    state: component(place, "administrative_area_level_1", true),
    phone: text(place["nationalPhoneNumber"]) || null,
    website,
    presence: webPresence(website),
    rating: typeof place["rating"] === "number" ? place["rating"] : null,
    reviewCount: typeof place["userRatingCount"] === "number" ? place["userRatingCount"] : null,
    mapsUri: text(place["googleMapsUri"]) || null,
  };
}

const normalName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (name: string, city: string | null) => `${normalName(name)}|${(city ?? "").toLowerCase()}`;

/**
 * Businesses without a real website that a demo can be built for (a city is
 * required), minus ones that already have a demo with the same name.
 */
export function selectProspects(places: Record<string, unknown>[], existingNames: string[] = []): FoundProspect[] {
  const taken = new Set(existingNames.map(normalName));
  const seen = new Set<string>();
  const out: FoundProspect[] = [];
  for (const place of places) {
    const prospect = normalizePlace(place);
    if (!prospect || prospect.presence === "has_website" || !prospect.city) continue;
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
  };
}
