/**
 * Small, pure SEO guards for generated client websites (/s/<slug> and custom domains).
 *
 * Everything here protects search output from stale or unsafe wording without
 * inventing facts: a city that is not the business's own never appears in a
 * title or description, canonical addresses have one stable shape, and
 * pictures that carry no description get one built from the business record.
 */

/**
 * Well-known US metros. A page title or description that names one of these
 * while the business is somewhere else is stale (a template or an earlier
 * workspace's city), so it is replaced with wording built from the real record.
 * Names that are also common words or surnames (Jackson, Orange, Reading,
 * Mobile, Charlotte-the-name) are left out on purpose to avoid false positives.
 */
const KNOWN_CITIES = [
  "New York City", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego",
  "Dallas", "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Indianapolis", "San Francisco",
  "Seattle", "Denver", "Washington DC", "Nashville", "Oklahoma City", "El Paso", "Boston", "Portland",
  "Las Vegas", "Detroit", "Memphis", "Louisville", "Baltimore", "Milwaukee", "Albuquerque", "Tucson", "Fresno",
  "Sacramento", "Kansas City", "Mesa", "Atlanta", "Omaha", "Colorado Springs", "Raleigh", "Miami", "Virginia Beach",
  "Oakland", "Minneapolis", "Tulsa", "Tampa", "Arlington", "New Orleans", "Wichita", "Cleveland", "Bakersfield",
  "Honolulu", "Anaheim", "Aurora", "Santa Ana", "Riverside", "Corpus Christi", "Lexington", "Pittsburgh",
  "Anchorage", "Stockton", "Cincinnati", "St. Louis", "Saint Louis", "Greensboro", "Plano", "Newark", "Durham",
  "Lincoln", "Orlando", "Irvine", "Toledo", "Jersey City", "Chula Vista", "Fort Wayne", "St. Petersburg",
  "Laredo", "Chandler", "Madison", "Lubbock", "Scottsdale", "Reno", "Buffalo", "Gilbert", "Glendale", "Winston-Salem",
  "Chesapeake", "Norfolk", "Fremont", "Garland", "Irving", "Hialeah", "Richmond", "Boise", "Spokane", "Baton Rouge",
  "Tacoma", "San Bernardino", "Rochester", "Salt Lake City", "Charleston", "Savannah", "Birmingham", "Fayetteville",
  "Cary", "Wilmington", "Asheville", "Charlotte",
];

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (value: string) => value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

/**
 * The first well-known city named in `text` that is not one of the business's
 * own places (city, state, service area, street address). Null when the text
 * names no foreign city, or when the business has no known place to compare to.
 */
export function foreignCityIn(text: string | null | undefined, ownPlaces: readonly (string | null | undefined)[]): string | null {
  const places = ownPlaces.map((p) => norm(String(p ?? ""))).filter(Boolean);
  const body = String(text ?? "");
  if (!body || places.length === 0) return null;
  const haystack = places.join(" | ");
  for (const city of KNOWN_CITIES) {
    if (!new RegExp(`(?<![A-Za-z])${escapeRe(city)}(?![A-Za-z])`, "i").test(body)) continue;
    // "Charlotte" is the business's own place when any own field mentions it.
    if (new RegExp(`(?<![a-z])${escapeRe(norm(city))}(?![a-z])`).test(haystack)) continue;
    return city;
  }
  return null;
}

/**
 * One stable canonical shape: https, lower-case host, no query or fragment, and
 * no trailing slash (the home page is the bare origin). Anything that is not an
 * http(s) URL is returned unchanged so callers can keep their own fallback.
 */
export function normalizeCanonicalUrl(url: string): string {
  const raw = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return raw;
  const path = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return `https://${parsed.host.toLowerCase()}${path}`;
}

/** Alt text for a picture that has none: the business, its trade and city, numbered after the first. */
export function fallbackImageAlt(base: string | null | undefined, index: number): string {
  const text = String(base ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return index <= 1 ? text : `${text} — photo ${index}`;
}

/** "Elite Mobile Detailing, Auto Detailing in Raleigh" from the real record; never invents a trade or city. */
export function imageAltBase(input: { name?: string | null; industry?: string | null; city?: string | null }): string {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return "";
  const industry = String(input.industry ?? "").replace(/\s+/g, " ").trim();
  const city = String(input.city ?? "").replace(/\s+/g, " ").trim();
  const trade = industry && !name.toLowerCase().includes(industry.toLowerCase()) ? `, ${industry}` : "";
  return `${name}${trade}${city ? ` in ${city}` : ""}`;
}

/**
 * True when `text` names a well-known city that is not the business's own AND
 * never names the business's own city. A title like "Plumbing in Raleigh,
 * Durham and Cary" stays (it names Raleigh); "Detailing in Austin" on a
 * Raleigh business is stale and is rejected. Without a known city nothing is rejected.
 */
export function mentionsWrongCity(
  text: string | null | undefined,
  own: { city?: string | null; state?: string | null; serviceArea?: string | null; address?: string | null },
): boolean {
  const city = String(own.city ?? "").trim();
  if (!city || !text) return false;
  if (new RegExp(`(?<![A-Za-z])${escapeRe(city)}(?![A-Za-z])`, "i").test(text)) return false;
  return foreignCityIn(text, [own.city, own.serviceArea, own.address]) !== null;
}
