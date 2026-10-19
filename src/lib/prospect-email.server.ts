import { extractBusinessEmail } from "./prospect-email";

/**
 * Free email lookup: opens the business's own listed link (Facebook page,
 * Linktree, directory profile…) and its contact page, then reads a public
 * email. No paid services, no guessing. Returns null when none is shown.
 */
export async function findPublicEmail(link: string | null): Promise<string | null> {
  if (!link) return null;
  const { guardedFetch } = await import("./net-guard.server");
  const base = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  const urls = [base];
  try {
    const u = new URL(base);
    if (!/facebook|instagram|tiktok|x\.com|twitter|yelp/i.test(u.hostname)) urls.push(new URL("/contact", u).toString());
  } catch {
    return null;
  }
  for (const url of urls) {
    try {
      const res = await guardedFetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; RevoraProspectLookup/1.0)", accept: "text/html" },
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        continue;
      }
      const html = (await res.text()).slice(0, 1_500_000);
      const email = extractBusinessEmail(html);
      if (email) return email;
    } catch {
      // Unreachable page: try the next one.
    }
  }
  return null;
}
