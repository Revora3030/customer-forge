import { extractBusinessEmail, extractMetaEmail } from "./prospect-email";
import type { EnrichmentSource } from "./prospect-enrichment";

const MAX_PAGE_BYTES = 80_000;
const REQUEST_TIMEOUT_MS = 5_000;

async function boundedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = MAX_PAGE_BYTES;
  let output = "";
  try {
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, remaining);
      output += decoder.decode(chunk, { stream: true });
      remaining -= chunk.byteLength;
      if (chunk.byteLength < value.byteLength) break;
    }
    return output + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type PublicEmailHit = { email: string; source: EnrichmentSource; url: string };

const SOCIAL_HOST = /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|yelp\.com)$/i;

/**
 * Look only at a public listing/profile URL and its same-origin /contact path.
 * guardedFetch validates DNS, blocks private-network targets, and refuses to
 * follow redirects. The lookup is best-effort; it never invents an address.
 *
 * Per page, in order: a mailto link or visible address on the page, then the
 * profile's meta tags (og/twitter description, contact-data email), where
 * social profiles usually publish a contact address. Each page is fetched once.
 */
export async function lookupPublicEmail(link: string | null): Promise<PublicEmailHit | null> {
  if (!link) return null;
  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : "https://" + link.trim());
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;
    if (base.username || base.password) return null;
  } catch {
    return null;
  }

  const urls = [base.toString()];
  if (!SOCIAL_HOST.test(base.hostname)) urls.push(new URL("/contact", base).toString());

  const { guardedFetch } = await import("./net-guard.server");
  for (const url of urls) {
    try {
      const response = await guardedFetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "user-agent": "RevoraProspectLookup/1.0 (+https://revoragrowthsystems.com)",
          accept: "text/html, text/plain;q=0.8",
        },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/(text\/html|text\/plain|application\/xhtml\+xml)/i.test(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const html = await boundedText(response);
      const visible = extractBusinessEmail(html);
      if (visible) return { email: visible, source: "public_page", url };
      const meta = extractMetaEmail(html);
      if (meta) return { email: meta, source: "social_meta", url };
    } catch {
      // Public site unavailable, unsafe, or too slow: try the next allowed URL.
    }
  }
  return null;
}

/** The published email on a public listing/profile page, or null. Never guessed. */
export async function findPublicEmail(link: string | null): Promise<string | null> {
  return (await lookupPublicEmail(link))?.email ?? null;
}

/**
 * Fetches a business's own homepage once and lists verified gaps (phone
 * readiness, https, online booking/quote, load time). Returns null when the
 * page can't be read, so an unreachable site is never pitched as "broken".
 */
export async function assessWebsite(link: string | null): Promise<import("./prospect-finder").SiteGap[] | null> {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : "https://" + link.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
  } catch {
    return null;
  }
  const { guardedFetch } = await import("./net-guard.server");
  const started = Date.now();
  try {
    const response = await guardedFetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
      headers: { "user-agent": "RevoraProspectLookup/1.0 (+https://revoragrowthsystems.com)", accept: "text/html" },
    });
    if (!response.ok || !/(text\/html|application\/xhtml\+xml)/i.test(response.headers.get("content-type") ?? "text/html")) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const html = await boundedText(response);
    const loadMs = Date.now() - started;
    if (html.length < 200) return null;
    const { siteGaps } = await import("./prospect-finder");
    return siteGaps({ html, finalUrl: url.toString(), loadMs });
  } catch {
    return null;
  }
}
