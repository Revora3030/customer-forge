/**
 * Free stock photo search (Unsplash: UNSPLASH_ACCESS_KEY, Pexels: PEXELS_API_KEY).
 * Returns hotlinkable URLs with required photographer credit; never stores files.
 */
export type StockPhoto = {
  source: "unsplash" | "pexels";
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
  credit: string;
};

export function cleanPhotoQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  // eslint-disable-next-line no-control-regex -- strips control characters from untrusted input
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
