/**
 * OpenStreetMap as a free, keyless second lead source. OSM data is open
 * (ODbL): we only read public tags (name, trade, address, phone, website,
 * email) and credit "© OpenStreetMap contributors" wherever results show.
 */
import { webPresence, type FoundProspect } from "./prospect-finder";

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/** OSM tags for common trades. Unknown niches fall back to a name match. */
const TRADE_TAGS: { match: RegExp; tags: string[] }[] = [
  { match: /hvac|heating|air cond|\bac\b/i, tags: ['"craft"="hvac"'] },
  { match: /plumb/i, tags: ['"craft"="plumber"'] },
  { match: /electric/i, tags: ['"craft"="electrician"'] },
  { match: /roof/i, tags: ['"craft"="roofer"'] },
  { match: /landscap|lawn|garden|tree/i, tags: ['"craft"="gardener"', '"craft"="landscaper"'] },
  { match: /paint/i, tags: ['"craft"="painter"'] },
  { match: /carpent|handyman|contractor|remodel/i, tags: ['"craft"="carpenter"', '"craft"="builder"', '"craft"="handyman"'] },
  { match: /clean|maid|janitor/i, tags: ['"craft"="cleaning"', '"shop"="dry_cleaning"'] },
  { match: /detail|car wash/i, tags: ['"amenity"="car_wash"', '"shop"="car_repair"'] },
  { match: /mechanic|auto repair/i, tags: ['"shop"="car_repair"'] },
  { match: /barber|hair|salon/i, tags: ['"shop"="hairdresser"'] },
  { match: /nail|beauty|spa/i, tags: ['"shop"="beauty"'] },
  { match: /pest/i, tags: ['"craft"="pest_control"'] },
  { match: /locksmith/i, tags: ['"shop"="locksmith"', '"craft"="locksmith"'] },
];

const quote = (value: string) => value.replace(/["\\]/g, "").slice(0, 60);

/** Overpass QL for one niche inside a bounding box (south, west, north, east). */
export function overpassQuery(niche: string, bbox: [number, number, number, number]): string {
  const box = bbox.map((n) => n.toFixed(4)).join(",");
  const trade = TRADE_TAGS.find((t) => t.match.test(niche));
  const filters = trade
    ? trade.tags.map((tag) => `nwr[${tag}]["name"](${box});`)
    : [`nwr["name"~"${quote(niche)}",i]["craft"](${box});`, `nwr["name"~"${quote(niche)}",i]["shop"](${box});`];
  return `[out:json][timeout:40];(${filters.join("")});out center tags 60;`;
}

const tag = (tags: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = tags[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

/** One OSM element as a prospect, or null when it lacks a name or is closed. */
export function osmElementToProspect(
  element: { type?: unknown; id?: unknown; tags?: unknown },
  fallbackCity: string,
  fallbackState: string | null,
): (FoundProspect & { email: string | null }) | null {
  const tags = (element.tags && typeof element.tags === "object" ? element.tags : {}) as Record<string, unknown>;
  const name = tag(tags, "name");
  if (!name || typeof element.id !== "number" || typeof element.type !== "string") return null;
  if (tag(tags, "disused", "abandoned") || /^(closed|permanently closed)$/i.test(tag(tags, "opening_hours") ?? "")) return null;
  const website = tag(tags, "website", "contact:website", "url");
  const email = tag(tags, "email", "contact:email")?.toLowerCase() ?? null;
  const street = [tag(tags, "addr:housenumber"), tag(tags, "addr:street")].filter(Boolean).join(" ");
  const city = tag(tags, "addr:city") ?? fallbackCity;
  const state = tag(tags, "addr:state") ?? fallbackState;
  return {
    // "osm:" ids never reach Google photo lookups (they fail the place-ID check).
    placeId: `osm:${element.type}/${element.id}`,
    name: name.slice(0, 120),
    category: tag(tags, "craft", "shop", "amenity")?.replace(/_/g, " ") ?? null,
    address: [street, city, state].filter(Boolean).join(", ") || null,
    city,
    state,
    phone: tag(tags, "phone", "contact:phone"),
    website,
    presence: webPresence(website),
    rating: null,
    reviewCount: null,
    mapsUri: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
  };
}
