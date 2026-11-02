/**
 * Start a site from a Google Maps link (free, no Google Places key, no page
 * scraping). Everything here reads only the link text the owner pasted: the
 * place name Google puts in the address, the map pin, and nothing else. Hours,
 * phone, reviews and ratings are never read or guessed; the owner types those.
 *
 * Parsing builds on `mapsLookupFrom` (the prospect tools use the same reader),
 * and the map frame builds on `keylessMapEmbedUrl` from `site-embed.ts`.
 */
import { mapsLookupFrom } from "@/lib/prospect-source";
import { keylessMapEmbedUrl } from "@/lib/site-embed";

export type MapsLinkFields = {
  /** Business name as it appears in the link. The owner confirms or edits it. */
  name: string;
  /** City or area, only when the link text names one; otherwise empty. */
  city: string;
  /** Two-letter state, only when the link text names one; otherwise empty. */
  state: string;
  lat: number | null;
  lng: number | null;
};

export type MapsLinkParse =
  | { ok: true; kind: "place"; fields: MapsLinkFields }
  | { ok: true; kind: "short_link"; url: string }
  | { ok: false; message: string };

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co", "g.page"]);

/** True when the text is (or starts like) a Google Maps link, so it must not be fetched as a website. */
export function looksLikeMapsLink(value: string): boolean {
  const raw = String(value ?? "").trim();
  if (!raw || /\s/.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (SHORT_HOSTS.has(host)) return host !== "goo.gl" || url.pathname.startsWith("/maps");
  if (host === "maps.google.com" || /^maps\.google\.[a-z.]{2,8}$/.test(host)) return true;
  return /^google\.[a-z.]{2,8}$/.test(host) && url.pathname.startsWith("/maps");
}

const STATE = /^[A-Za-z]{2}$/;

/**
 * Splits "Joe's Plumbing, 12 Main St, Raleigh, NC 27601" style text into a name
 * and, only when the text really contains them, a city and state. Plain names
 * like "Joe's Plumbing" give an empty city: nothing is guessed.
 */
export function splitPlaceText(text: string): { name: string; city: string; state: string } {
  const parts = text
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const name = (parts[0] ?? "").slice(0, 120);
  let city = "";
  let state = "";
  const rest = parts.slice(1);
  // "NC 27601" or "NC" as the last part is a state; the part before it is the city.
  const last = rest[rest.length - 1] ?? "";
  const stateMatch = /^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/.exec(last);
  if (stateMatch && STATE.test(stateMatch[1]!)) {
    state = stateMatch[1]!.toUpperCase();
    const before = rest[rest.length - 2] ?? "";
    if (before && !/^\d/.test(before)) city = before.slice(0, 80);
  } else if (rest.length === 1 && rest[0] && !/\d/.test(rest[0])) {
    city = rest[0].slice(0, 80);
  }
  return { name, city, state };
}

/** The pin Google stores for the place (!3d..!4d..), which beats the map-view centre (@lat,lng). */
function pinFromLink(raw: string): { lat: number; lng: number } | null {
  const match = raw.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * Reads a pasted Google Maps link. Full place and search links give a name and
 * pin; share short links (maps.app.goo.gl, g.co/kgs) come back as `short_link`
 * so the server can follow the redirect and parse the address it lands on.
 */
export function parseMapsLink(input: string): MapsLinkParse {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, message: "Paste a Google Maps link." };
  if (raw.length > 2000) return { ok: false, message: "That link is too long." };
  if (/\s/.test(raw) || !looksLikeMapsLink(raw))
    return { ok: false, message: "That isn't a Google Maps link. Open your business in Google Maps, tap Share, then Copy link." };
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let lookup;
  try {
    lookup = mapsLookupFrom(withScheme);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't read that link." };
  }
  if (lookup.kind === "short_link") return { ok: true, kind: "short_link", url: lookup.url };
  const text = lookup.query ?? "";
  if (!text) {
    return { ok: false, message: "Couldn't read a business name from that link. Open your business in Google Maps, tap Share, then Copy link." };
  }
  const { name, city, state } = splitPlaceText(text);
  if (name.length < 2) return { ok: false, message: "Couldn't read a business name from that link." };
  const pin = pinFromLink(withScheme);
  return {
    ok: true,
    kind: "place",
    fields: { name, city, state, lat: pin?.lat ?? lookup.lat, lng: pin?.lng ?? lookup.lng },
  };
}

/**
 * A g.co/kgs share link lands on a Google search page, not a Maps page. When
 * that page's address carries the search text (q=…), turn it into the matching
 * Maps search link so the same reader can use it. Anything else is returned as is.
 */
export function mapsLinkFromResolved(url: string): string {
  try {
    const next = new URL(url);
    const host = next.hostname.toLowerCase().replace(/^www\./, "");
    if (/^google\.[a-z.]{2,8}$/.test(host) && next.pathname === "/search") {
      const q = (next.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (q.length >= 3) return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
    }
  } catch {
    /* fall through */
  }
  return url;
}

function validPin(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Free Google Maps frame for a place: `https://www.google.com/maps?q=…&output=embed`.
 * Uses "name@lat,lng" when the pin is known so the right branch is shown, name
 * (plus city when known) otherwise. No API key.
 */
export function mapsEmbedUrl(fields: Pick<MapsLinkFields, "name" | "city" | "lat" | "lng">): string | null {
  const name = fields.name.trim();
  if (!name) return null;
  if (validPin(fields.lat, fields.lng))
    return keylessMapEmbedUrl(`${name}@${fields.lat!.toFixed(6)},${fields.lng!.toFixed(6)}`);
  return keylessMapEmbedUrl([name, fields.city.trim()].filter(Boolean).join(", "));
}

/**
 * A short, readable Maps link that parses back to the same name and pin. It is
 * what gets saved as the business's Google link (and opens the listing for
 * visitors) instead of the long link with Google's tracking data in it.
 */
export function canonicalMapsLink(fields: Pick<MapsLinkFields, "name" | "city" | "state" | "lat" | "lng">): string | null {
  const name = fields.name.trim();
  if (!name) return null;
  const label = [name, fields.city.trim(), fields.state.trim()].filter(Boolean).join(", ");
  const slug = encodeURIComponent(label).replace(/%20/g, "+");
  if (validPin(fields.lat, fields.lng)) return `https://www.google.com/maps/place/${slug}/@${fields.lat!.toFixed(6)},${fields.lng!.toFixed(6)},17z`;
  return `https://www.google.com/maps/search/${slug}`;
}

/**
 * The map frame for a site, from the Google link saved on the business. Only a
 * full Maps link we can read gives a frame; anything else (a Facebook page, a
 * short link, an unreadable link) shows no map instead of a broken box.
 */
export function mapsEmbedFromSavedLink(link: string | null | undefined): { url: string; name: string } | null {
  const raw = String(link ?? "").trim();
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  const parsed = parseMapsLink(raw);
  if (!parsed.ok || parsed.kind !== "place") return null;
  const url = mapsEmbedUrl(parsed.fields);
  return url ? { url, name: parsed.fields.name } : null;
}
