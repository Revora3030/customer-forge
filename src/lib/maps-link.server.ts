/**
 * Follows a Google Maps share short link (maps.app.goo.gl, g.co/kgs, g.page)
 * to the address it points at. Only the Location header of each redirect is
 * read; the Google page itself is never fetched or parsed. Every hop goes
 * through the net guard (public hosts only, no automatic redirects).
 */
const MAX_SHORT_LINK_HOPS = 4;

export async function resolveShortLink(url: string): Promise<string> {
  const { guardedFetch } = await import("@/lib/net-guard.server");
  const { mapsRedirectTarget } = await import("@/lib/prospect-source");
  let current = url;
  for (let hop = 0; hop < MAX_SHORT_LINK_HOPS; hop += 1) {
    const response = await guardedFetch(current, { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "RevoraProspectLookup/1.0" } });
    await response.body?.cancel().catch(() => undefined);
    const next = mapsRedirectTarget(response.headers.get("location"), current);
    if (!next) break;
    const host = new URL(next).hostname.toLowerCase();
    if (!["maps.app.goo.gl", "goo.gl", "g.co", "g.page", "consent.google.com"].includes(host)) return next;
    current = next;
  }
  throw new Error("Couldn't open that share link. Open the business in Google Maps and paste the full address from the browser bar instead.");
}
