/**
 * Best-effort Cloudflare cache purge after a publish or live revert.
 *
 * Customer pages are server-rendered per request today, so a purge is not
 * required for correctness. It becomes required the moment edge caching is
 * switched on for `/s/*` or custom domains, and it is wired in now so that
 * switch is safe. It only runs when CLOUDFLARE_CACHE_PURGE_TOKEN (Cache Purge
 * permission only) and CLOUDFLARE_ZONE_ID are configured, and it never throws:
 * a failed purge must not fail a publish.
 */

export function purgeUrls(base: string | null, paths: readonly string[]): string[] {
  if (!base || !/^https:\/\//.test(base)) return [];
  const root = base.replace(/\/$/, "");
  const urls = new Set<string>();
  for (const path of paths) {
    urls.add(path === "/" ? root : `${root}${path}`);
    if (path === "/") urls.add(`${root}/`);
  }
  urls.add(`${root}/sitemap.xml`);
  // Cloudflare accepts at most 30 files per purge call.
  return [...urls].slice(0, 30);
}

export async function purgeEdgeCache(urls: readonly string[]): Promise<{ purged: number; skipped?: string }> {
  // A dedicated purge-only token: the AI token is never reused here.
  const token = process.env["CLOUDFLARE_CACHE_PURGE_TOKEN"];
  const zone = process.env["CLOUDFLARE_ZONE_ID"];
  if (!token || !zone) return { purged: 0, skipped: "not_configured" };
  if (!urls.length) return { purged: 0, skipped: "nothing_to_purge" };
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone)}/purge_cache`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ files: urls }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.warn("[edge-cache] purge refused", response.status);
      return { purged: 0, skipped: `http_${response.status}` };
    }
    return { purged: urls.length };
  } catch (error) {
    console.warn("[edge-cache] purge failed", (error as Error)?.message);
    return { purged: 0, skipped: "network" };
  }
}
