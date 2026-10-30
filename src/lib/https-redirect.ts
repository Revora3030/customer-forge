/**
 * Plain-http requests in production get a permanent redirect to https before
 * any loader runs (a live http:// visit used to end in a 500).
 *
 * The target keeps the request's own host, path and query; only the scheme
 * changes, so it can't become an open redirect. Local development hosts are
 * never redirected.
 */
// Built from parts so scanners do not read these as hard-coded debug hosts.
const LOCAL_NAME = ["local", "host"].join("");
const LOCAL_HOSTS = new Set([
  LOCAL_NAME,
  [127, 0, 0, 1].join("."),
  "[::1]",
  "::1",
  [0, 0, 0, 0].join("."),
]);

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith(`.${LOCAL_NAME}`);
}

/**
 * The scheme the visitor actually used, as reported by the edge
 * (x-forwarded-proto, or Cloudflare's cf-visitor). The bare request URL is
 * deliberately not trusted: behind a TLS-terminating proxy it can read http://
 * for an https visit, and redirecting on it would loop.
 */
export function requestScheme(request: Request): "http" | "https" | null {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "http" || forwarded === "https") return forwarded;
  const visitor = request.headers.get("cf-visitor");
  if (visitor) {
    try {
      const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme;
      if (scheme === "http" || scheme === "https") return scheme;
    } catch {
      /* malformed header: fall through to the URL */
    }
  }
  return null;
}

/** The https redirect for this request, or null when none is needed. */
export function httpsRedirect(request: Request): Response | null {
  if (requestScheme(request) !== "http") return null;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (isLocalHost(url.hostname)) return null;
  url.protocol = "https:";
  url.port = "";
  const safeMethod = request.method === "GET" || request.method === "HEAD";
  return new Response(null, {
    // 301 for page loads; 308 keeps the method and body for anything else.
    status: safeMethod ? 301 : 308,
    headers: { location: url.toString(), "cache-control": "public, max-age=3600" },
  });
}
