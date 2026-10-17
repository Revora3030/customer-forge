import { guardedFetch } from "./net-guard.server";
import { validatePublicWebsiteUrl } from "./audit/website-audit";
import { extractFacts, mergeFacts, nextPages, type ImportedFacts } from "./site-import";

const MAX_PAGE_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const PAGE_TIMEOUT_MS = 10_000;

export class SiteImportError extends Error {}

/** Reads at most `limit` bytes; the rest of the body is never downloaded. */
async function boundedHtml(response: Response, limit = MAX_PAGE_BYTES): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = limit;
  let html = "";
  try {
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, remaining);
      html += decoder.decode(chunk, { stream: true });
      remaining -= chunk.byteLength;
    }
    return html + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** One public HTML page, following redirects by hand so every hop is re-checked. */
async function fetchPage(start: string): Promise<{ url: string; html: string } | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await guardedFetch(url, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: {
        "user-agent": "RevoraSiteImport/1.0 (+https://revoragrowthsystems.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) return null;
      url = validatePublicWebsiteUrl(new URL(location, url).toString()).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!/text\/html|application\/xhtml/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return { url, html: await boundedHtml(response) };
  }
  return null;
}

export type SiteImportResult = { url: string; pagesRead: string[]; facts: ImportedFacts };

/**
 * Reads a business's existing home page and up to three of its own pages
 * (services, about, contact) and returns the facts they state.
 */
export async function importSite(rawUrl: string): Promise<SiteImportResult> {
  let start: string;
  try {
    start = validatePublicWebsiteUrl(rawUrl).toString();
  } catch (error) {
    throw new SiteImportError(error instanceof Error ? error.message : "Enter your website address.");
  }
  let home: { url: string; html: string } | null;
  try {
    home = await fetchPage(start);
  } catch {
    throw new SiteImportError("Revora couldn't reach that website. Check the address and try again.");
  }
  if (!home) throw new SiteImportError("That address didn't return a web page Revora can read.");
  const first = extractFacts(home.html, home.url);
  const extra = await Promise.all(
    nextPages(first.links, home.url).map(async (url) => {
      try {
        const page = await fetchPage(url);
        return page ? { url: page.url, facts: extractFacts(page.html, page.url) } : null;
      } catch {
        return null;
      }
    }),
  );
  const pages = [{ url: home.url, facts: first }, ...extra.filter((page): page is NonNullable<typeof page> => page !== null)];
  return { url: home.url, pagesRead: pages.map((page) => page.url), facts: mergeFacts(pages.map((page) => page.facts)) };
}
