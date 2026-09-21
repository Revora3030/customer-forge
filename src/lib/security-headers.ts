/**
 * Production security headers.
 *
 * Applied to every response the app serves — Revora's own platform pages and
 * every client website alike. The policy is the strictest one that still lets
 * the real integrations work, so it is written as an explicit allowlist rather
 * than a wildcard:
 *
 * - Stripe Checkout/Elements load `js.stripe.com` and open payment frames on
 *   `js.stripe.com` / `hooks.stripe.com`, and phone home to `m.stripe.network`.
 * - Supabase (auth, data, storage, realtime) is reached over https + wss.
 * - Google Fonts serve CSS from `fonts.googleapis.com` and files from
 *   `fonts.gstatic.com`.
 * - GA4 is optional and loads from `googletagmanager.com`.
 * - Client websites show images the business uploaded or linked, which can live
 *   on any https host, so `img-src` stays broad while script/frame/connect
 *   sources stay locked down.
 *
 * `script-src` has to allow inline scripts: the server-rendered HTML carries
 * the router's hydration payload inline. Everything that actually executes
 * remote code is still restricted to the hosts above.
 */

const SUPABASE_ORIGIN = "https://*.supabase.co";
const SUPABASE_WS = "wss://*.supabase.co";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  // Only Revora's own pages may frame Revora pages. This still blocks every
  // other origin (the clickjacking protection that matters), while letting the
  // builder open a customer page in a same-origin frame to photograph what
  // actually rendered for the visual review.
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  [
    "connect-src 'self'",
    SUPABASE_ORIGIN,
    SUPABASE_WS,
    "https://api.stripe.com",
    "https://m.stripe.network",
    "https://maps.googleapis.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://www.googletagmanager.com",
  ].join(" "),
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "display-capture=()",
  "geolocation=(self)",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  'payment=(self "https://js.stripe.com")',
  "usb=()",
].join(", ");

/**
 * Headers safe to send on every response, including API and asset responses.
 * `Strict-Transport-Security` is only meaningful — and only safe — on HTTPS, so
 * it is omitted for local http development.
 */
export function baseSecurityHeaders(options: { https: boolean }): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "x-dns-prefetch-control": "off",
    "x-permitted-cross-domain-policies": "none",
    "origin-agent-cluster": "?1",
    ...(options.https
      ? { "strict-transport-security": "max-age=31536000; includeSubDomains; preload" }
      : {}),
  };
}

/** The full set for an HTML document response. */
export function documentSecurityHeaders(options: { https: boolean }): Record<string, string> {
  return {
    ...baseSecurityHeaders(options),
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "permissions-policy": PERMISSIONS_POLICY,
  };
}

/**
 * Adds the headers to a response without overwriting anything a handler set
 * deliberately. Some runtimes hand back an immutable `Headers`, so a failed
 * mutation falls back to rebuilding the response around the same body.
 */
export function withSecurityHeaders(response: Response, options: { https: boolean }): Response {
  const contentType = response.headers.get("content-type") ?? "";
  const isDocument = contentType.includes("text/html");
  const headers = isDocument ? documentSecurityHeaders(options) : baseSecurityHeaders(options);

  try {
    for (const [key, value] of Object.entries(headers)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
    return response;
  } catch {
    const merged = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      if (!merged.has(key)) merged.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: merged,
    });
  }
}
