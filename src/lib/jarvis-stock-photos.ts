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
  const v = q.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return v.length >= 2 ? v : null;
}

export const unsplashSearchUrl = (q: string) =>
  `https://api.unsplash.com/search/photos?per_page=6&content_filter=high&query=${encodeURIComponent(q)}`;
export const pexelsSearchUrl = (q: string) =>
  `https://api.pexels.com/v1/search?per_page=6&query=${encodeURIComponent(q)}`;

const s = (v: unknown) => (typeof v === "string" ? v : "");
const httpsOnly = (u: string) => (u.startsWith("https://") ? u : "");

export function normalizeUnsplash(raw: unknown): StockPhoto[] {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, 6).flatMap((p): StockPhoto[] => {
    const r = (p ?? {}) as Record<string, any>;
    const url = httpsOnly(s(r.urls?.regular));
    const name = s(r.user?.name);
    if (!url || !name) return [];
    const ref = "?utm_source=revora_growth_systems&utm_medium=referral";
    const photographerUrl = s(r.user?.links?.html) ? `${s(r.user.links.html)}${ref}` : "";
    return [{ source: "unsplash", id: s(r.id), url, thumbUrl: httpsOnly(s(r.urls?.small)) || url, alt: s(r.alt_description) || s(r.description), photographer: name, photographerUrl, pageUrl: s(r.links?.html), credit: `Photo by ${name} on Unsplash` }];
  });
}

export function normalizePexels(raw: unknown): StockPhoto[] {
  const photos = (raw as { photos?: unknown })?.photos;
  if (!Array.isArray(photos)) return [];
  return photos.slice(0, 6).flatMap((p): StockPhoto[] => {
    const r = (p ?? {}) as Record<string, any>;
    const url = httpsOnly(s(r.src?.large));
    const name = s(r.photographer);
    if (!url || !name) return [];
    return [{ source: "pexels", id: String(r.id ?? ""), url, thumbUrl: httpsOnly(s(r.src?.medium)) || url, alt: s(r.alt), photographer: name, photographerUrl: s(r.photographer_url), pageUrl: s(r.url), credit: `Photo by ${name} on Pexels` }];
  });
}
