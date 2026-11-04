/**
 * Response caching for server-rendered pages (PR3 "fast first paint").
 *
 * - NOT WIRED YET (owner decision, PREMIUM-SITES-PLAN open question 5): a
 *   published site needs a purge-on-publish step before any route sends
 *   `publicSiteHeaders`. The helper and its tests are ready for that change.
 *   A PUBLISHED client website (`/s/:slug`, `/s/:slug/:page`, and the same
 *   pages on a verified custom domain) is identical for every visitor: no
 *   cookies, no per-visitor markup, no CSP nonce. It may be kept at the edge
 *   for a minute and served stale while the edge refetches, so a repeat
 *   visitor anywhere gets HTML from the nearest edge instead of waiting for a
 *   database round trip. Browsers never keep it (`max-age=0`), so a refresh
 *   right after publishing always asks the edge again, and a publish shows up
 *   at the edge within about a minute.
 * - A private draft preview (`/p/:token`, including the builder's own preview)
 *   is never stored anywhere (`private, no-store`), is never indexed, and never
 *   sends its secret address to another site as a referrer.
 */

/** Edge-cacheable for 60s, then served stale for up to 10 minutes while refetching. */
export const PUBLIC_SITE_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=600";

/** Never stored by a browser, proxy or edge. */
export const PRIVATE_NO_STORE = "private, no-store";

type MatchLike = { id: string };

/**
 * True when `match` is the deepest matched route. A parent route (the site
 * home, `/s/:slug`) must not decide caching or preloads for a child page
 * (`/s/:slug/:page`): only the page that actually renders does.
 */
export function isLeafMatch(matches: readonly MatchLike[] | undefined, match: MatchLike | undefined): boolean {
  if (!matches?.length || !match) return true;
  return matches[matches.length - 1]?.id === match.id;
}

/**
 * Headers for a published client page. Only a page that really rendered (its
 * loader returned a site) is edge-cached; a missing or unpublished site is not
 * stored, so the first visit after a publish never sees a cached "not found".
 */
export function publicSiteHeaders(rendered: boolean): Record<string, string> {
  return { "cache-control": rendered ? PUBLIC_SITE_CACHE_CONTROL : PRIVATE_NO_STORE };
}

/** Headers for every private draft preview response, valid link or not. */
export function privatePreviewHeaders(): Record<string, string> {
  return {
    "cache-control": PRIVATE_NO_STORE,
    "x-robots-tag": "noindex, nofollow",
    // The token in the address is the only credential: never leak it.
    "referrer-policy": "no-referrer",
  };
}
