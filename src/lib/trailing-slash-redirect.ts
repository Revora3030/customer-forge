/**
 * One canonical URL per page: `/pricing/` permanently redirects (308) to
 * `/pricing`, keeping the query string. Without this the router answered with
 * a temporary 307, so search engines could index both forms.
 *
 * Deliberately narrow so nothing machine-facing changes:
 * - only GET and HEAD are redirected (a POST is never bounced);
 * - API, server-function and Lovable hook paths are left alone, so webhooks
 *   and schedulers that post to a trailing-slash URL keep working;
 * - the root `/` is never redirected.
 *
 * The Location is a same-origin path (leading slashes collapsed to one), so it
 * cannot become an open redirect such as `//evil.example`.
 */
const PASS_THROUGH_PREFIXES = ["/api/", "/_serverFn/", "/lovable/"];

export function canonicalPath(pathname: string): string | null {
  if (pathname === "/" || !pathname.endsWith("/")) return null;
  const trimmed = pathname.replace(/\/+$/, "").replace(/^\/{2,}/, "/");
  return trimmed === "" ? "/" : trimmed;
}

/** The trailing-slash redirect for this request, or null when none is needed. */
export function trailingSlashRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const path = url.pathname;
  if (PASS_THROUGH_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  const target = canonicalPath(path);
  if (target === null) return null;
  return new Response(null, {
    status: 308,
    headers: { location: target + url.search, "cache-control": "public, max-age=3600" },
  });
}
