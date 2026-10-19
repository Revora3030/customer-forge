import { extractBusinessEmail } from "./prospect-email";

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

/**
 * Look only at a public listing/profile URL and its same-origin /contact path.
 * guardedFetch validates DNS, blocks private-network targets, and refuses to
 * follow redirects. The lookup is best-effort; it never invents an address.
 */
export async function findPublicEmail(link: string | null): Promise<string | null> {
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
  if (!/(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|yelp\.com)$/i.test(base.hostname)) {
    urls.push(new URL("/contact", base).toString());
  }

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
      const email = extractBusinessEmail(await boundedText(response));
      if (email) return email;
    } catch {
      // Public site unavailable, unsafe, or too slow: try the next allowed URL.
    }
  }
  return null;
}
