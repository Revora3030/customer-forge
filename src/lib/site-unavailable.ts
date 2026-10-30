/**
 * The page a customer website serves once its post-cancellation grace period
 * is over (src/lib/site-hosting.ts).
 *
 * Status 410 Gone, not 503: 503 tells search engines "brief outage, come back
 * soon" and Google treats a 503 that lasts days as an error anyway, while a
 * canceled site can stay down indefinitely. 410 says plainly that the content
 * was removed on purpose, so stale listings drop quickly instead of lingering;
 * if the owner resubscribes, the page answers 200 again, reappears in the
 * sitemap and is recrawled. The page is neutral (no Revora branding, no
 * business details) and noindex, and it is not cached so a restore shows at
 * once.
 */
export const SITE_UNAVAILABLE_STATUS = 410;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>This site is currently unavailable</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f7f7f5;color:#2b2d33}
  main{max-width:28rem;padding:2rem;text-align:center}
  h1{font-size:1.4rem;font-weight:600;margin:0 0 .5rem}
  p{margin:0;color:#5f626b;line-height:1.5}
</style>
</head>
<body>
<main>
<h1>This site is currently unavailable</h1>
<p>Please check back later.</p>
</main>
</body>
</html>
`;

export function siteUnavailableResponse(method: string): Response {
  return new Response(method === "HEAD" ? null : HTML, {
    status: SITE_UNAVAILABLE_STATUS,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "no-store",
    },
  });
}

/**
 * Which tenant this request is for, if it could be a customer website page:
 * GET/HEAD only, never the API, server functions, assets or robots.txt.
 * Returns the /s/<slug> slug on Revora's own hosts, or the host itself when it
 * could be a customer's own domain.
 */
export function siteRequestTarget(
  request: Request,
  isOwnHost: (host: string) => boolean,
): { kind: "slug"; slug: string } | { kind: "host"; host: string } | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const path = url.pathname;
  if (/^\/(api|_serverFn|lovable|assets|_build|@)/.test(path)) return null;
  if (path === "/robots.txt") return null;
  // Static files (images, scripts, fonts) are never the tenant's pages; the
  // sitemap is, so it is answered with the same 410.
  const last = path.split("/").pop() ?? "";
  if (/\.[a-z0-9]{1,8}$/i.test(last) && !/\.xml$/i.test(last)) return null;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host)
    .split(",")[0]!
    .trim()
    .toLowerCase();
  if (isOwnHost(host)) {
    const match = /^\/s\/([a-z0-9-]{1,80})(\/|$)/.exec(path);
    return match ? { kind: "slug", slug: match[1]! } : null;
  }
  return host ? { kind: "host", host } : null;
}
