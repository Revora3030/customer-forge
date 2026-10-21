/**
 * Stock photo search for Jarvis.
 *
 * Openverse and Wikimedia Commons are searched without a key; Unsplash
 * (UNSPLASH_ACCESS_KEY) and Pexels (PEXELS_API_KEY) join only when connected.
 * Returns hotlinkable URLs with the licence and credit each photo requires;
 * never stores files, saves to the library or places photos on a site.
 */
import {
  normaliseStockResults,
  openverseSearchUrl,
  type StockPhoto as LicensedStockPhoto,
} from "./builder/stock-photos";
import { normaliseWikimediaResults, WIKIMEDIA_HEADERS, WIKIMEDIA_USER_AGENT, wikimediaSearchUrl } from "./builder/wikimedia-photos";

export type StockPhotoSource = "unsplash" | "pexels" | "openverse" | "wikimedia";

export type StockPhoto = {
  source: StockPhotoSource;
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
  credit: string;
  /** Licence code from the library's own metadata, e.g. "cc0", "by", "by-sa". */
  license?: string;
  licenseUrl?: string | null;
  sourcePage?: string | null;
  /** Exact credit line the licence requires. */
  attribution?: string;
};

/** Maps an openly licensed library result into the Jarvis shape, licence kept. */
export function fromLicensedStock(photo: LicensedStockPhoto, source: "openverse" | "wikimedia"): StockPhoto {
  return {
    source,
    id: photo.id,
    url: photo.url,
    thumbUrl: photo.thumbnail,
    alt: photo.title,
    photographer: photo.creator ?? "",
    photographerUrl: "",
    pageUrl: photo.sourcePage ?? "",
    credit: photo.attribution,
    license: photo.licenseCode,
    licenseUrl: photo.licenseUrl,
    sourcePage: photo.sourcePage,
    attribution: photo.attribution,
  };
}

export function cleanPhotoQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  // eslint-disable-next-line no-control-regex -- control characters are stripped from model input
  const v = q.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return v.length >= 2 ? v : null;
}

export const unsplashSearchUrl = (q: string) =>
  `https://api.unsplash.com/search/photos?per_page=6&content_filter=high&query=${encodeURIComponent(q)}`;
export const pexelsSearchUrl = (q: string) =>
  `https://api.pexels.com/v1/search?per_page=6&query=${encodeURIComponent(q)}`;

const s = (v: unknown) => (typeof v === "string" ? v : "");
const g = (o: unknown, ...k: string[]): unknown => k.reduce<unknown>((a, key) => (a && typeof a === "object" ? (a as Record<string, unknown>)[key] : undefined), o);
const httpsOnly = (u: string) => (u.startsWith("https://") ? u : "");

export function normalizeUnsplash(raw: unknown): StockPhoto[] {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, 6).flatMap((p): StockPhoto[] => {
    const url = httpsOnly(s(g(p, "urls", "regular")));
    const name = s(g(p, "user", "name"));
    if (!url || !name) return [];
    const ref = "?utm_source=revora_growth_systems&utm_medium=referral";
    const profile = s(g(p, "user", "links", "html"));
    const photographerUrl = profile ? `${profile}${ref}` : "";
    return [{ source: "unsplash", id: s(g(p, "id")), url, thumbUrl: httpsOnly(s(g(p, "urls", "small"))) || url, alt: s(g(p, "alt_description")) || s(g(p, "description")), photographer: name, photographerUrl, pageUrl: s(g(p, "links", "html")), credit: `Photo by ${name} on Unsplash` }];
  });
}

export function normalizePexels(raw: unknown): StockPhoto[] {
  const photos = (raw as { photos?: unknown })?.photos;
  if (!Array.isArray(photos)) return [];
  return photos.slice(0, 6).flatMap((p): StockPhoto[] => {
    const url = httpsOnly(s(g(p, "src", "large")));
    const name = s(g(p, "photographer"));
    if (!url || !name) return [];
    return [{ source: "pexels", id: String(g(p, "id") ?? ""), url, thumbUrl: httpsOnly(s(g(p, "src", "medium"))) || url, alt: s(g(p, "alt")), photographer: name, photographerUrl: s(g(p, "photographer_url")), pageUrl: s(g(p, "url")), credit: `Photo by ${name} on Pexels` }];
  });
}

export type StockSourceStatus = "ok" | "needs_key" | "free_quota_exhausted" | "unreachable" | `http_${number}`;

export type StockSearchOutcome = {
  /** True when at least one source answered; false when every source failed. */
  anySourceAnswered: boolean;
  sources: Record<StockPhotoSource, StockSourceStatus>;
  photos: StockPhoto[];
  omittedForSize: number;
};

const MAX_PHOTOS = 12;
const SOURCE_TIMEOUT_MS = 8000;
/** Leaves room under the registry's 9000-byte output cap for query and status fields. */
const PHOTO_BYTES_BUDGET = 8200;

/** Round-robin across sources so no single library crowds out the others. */
export function interleaveBySource(lists: StockPhoto[][], limit = MAX_PHOTOS): StockPhoto[] {
  const out: StockPhoto[] = [];
  const seen = new Set<string>();
  for (let index = 0; out.length < limit && lists.some((list) => index < list.length); index++) {
    for (const list of lists) {
      const photo = list[index];
      if (!photo || seen.has(photo.url)) continue;
      seen.add(photo.url);
      out.push(photo);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

/**
 * Searches every source that can run now. Openverse and Wikimedia always run
 * keylessly; keyed sources run only when their key is saved and otherwise
 * report needs_key without a request. Each source reports its own outcome.
 */
export async function searchJarvisStockPhotos(
  query: string,
  env: Record<string, string | undefined> = process.env,
): Promise<StockSearchOutcome> {
  const sources = {} as Record<StockPhotoSource, StockSourceStatus>;
  const run = async (name: StockPhotoSource, url: string, headers: Record<string, string>, norm: (raw: unknown) => StockPhoto[]) => {
    try {
      // Fixed API hosts only. Workers reject redirect: "error"; a 3xx fails the ok check.
      const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
      if (!res.ok) {
        sources[name] = res.status === 429 ? "free_quota_exhausted" : `http_${res.status}`;
        return [];
      }
      const photos = norm(await res.json());
      sources[name] = "ok";
      return photos;
    } catch {
      sources[name] = "unreachable";
      return [];
    }
  };
  const skip = (name: StockPhotoSource) => {
    sources[name] = "needs_key";
    return Promise.resolve([] as StockPhoto[]);
  };
  const unsplashKey = env["UNSPLASH_ACCESS_KEY"]?.trim();
  const pexelsKey = env["PEXELS_API_KEY"]?.trim();

  const lists = await Promise.all([
    run("openverse", openverseSearchUrl(query, { pageSize: 8 }).toString(), { Accept: "application/json", "User-Agent": WIKIMEDIA_USER_AGENT }, (raw) =>
      normaliseStockResults(raw).map((photo) => fromLicensedStock(photo, "openverse"))),
    run("wikimedia", wikimediaSearchUrl(query).toString(), WIKIMEDIA_HEADERS, (raw) =>
      normaliseWikimediaResults(raw).map((photo) => fromLicensedStock(photo, "wikimedia"))),
    unsplashKey ? run("unsplash", unsplashSearchUrl(query), { Authorization: `Client-ID ${unsplashKey}`, "Accept-Version": "v1" }, normalizeUnsplash) : skip("unsplash"),
    pexelsKey ? run("pexels", pexelsSearchUrl(query), { Authorization: pexelsKey }, normalizePexels) : skip("pexels"),
  ]);

  const photos = interleaveBySource(lists);
  let omittedForSize = 0;
  while (photos.length && bytes(photos) > PHOTO_BYTES_BUDGET) {
    photos.pop();
    omittedForSize++;
  }
  return {
    anySourceAnswered: Object.values(sources).includes("ok"),
    sources,
    photos,
    omittedForSize,
  };
}
