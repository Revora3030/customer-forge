/**
 * Address suggestions from Photon (Apache-2.0, https://photon.komoot.io), a
 * free public geocoder over OpenStreetMap data. No key, no sign-up. Results are
 * © OpenStreetMap contributors (ODbL) and the attribution must stay visible
 * wherever suggestions are shown. Nominatim is NOT used for autocomplete: its
 * usage policy forbids it.
 *
 * Fair use: only typed queries of 3+ characters, debounced, max 5 results.
 */

export const PHOTON_ORIGIN = "https://photon.komoot.io";
export const PHOTON_MIN_CHARS = 3;
export const PHOTON_DEBOUNCE_MS = 350;
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/** Geographic centre of the contiguous US, used as a soft bias only. */
const US_BIAS = { lat: 39.8283, lon: -98.5795 };

export interface AddressSuggestion {
  /** One-line label for the list. */
  label: string;
  /** "123 Main St" (or the place name when there is no house number). */
  street: string;
  city: string;
  state: string;
  postcode: string;
  countryCode: string;
}

export function photonUrl(query: string, bias: { lat: number; lon: number } = US_BIAS): string | null {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 200);
  if (q.length < PHOTON_MIN_CHARS) return null;
  const params = new URLSearchParams({
    q,
    limit: "5",
    lang: "en",
    lat: String(bias.lat),
    lon: String(bias.lon),
  });
  return `${PHOTON_ORIGIN}/api/?${params.toString()}`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Turns a Photon GeoJSON response into address suggestions, US first. */
export function parsePhoton(json: unknown): AddressSuggestion[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const p = (feature as { properties?: Record<string, unknown> } | null)?.properties;
    if (!p) continue;
    const houseNumber = str(p["housenumber"]);
    const road = str(p["street"]);
    const name = str(p["name"]);
    const street = road ? (houseNumber ? `${houseNumber} ${road}` : road) : name;
    const city = str(p["city"]) || str(p["town"]) || str(p["village"]) || str(p["district"]) || str(p["county"]);
    const state = str(p["state"]);
    const postcode = str(p["postcode"]);
    const countryCode = str(p["countrycode"]).toUpperCase();
    if (!street && !city) continue;
    const label = [name && name !== street && name !== city ? name : "", street, city, [state, postcode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, street, city, state, postcode, countryCode });
  }
  return out.sort((a, b) => Number(b.countryCode === "US") - Number(a.countryCode === "US"));
}
