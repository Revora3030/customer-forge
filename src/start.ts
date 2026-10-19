import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import {
  isTrafficDomainHost,
  isTrafficRedirectHost,
  trafficRedirectUrl,
} from "@/lib/revora-address";
import { withSecurityHeaders } from "@/lib/security-headers";
import { createUnhandledErrorResponse } from "@/lib/api-error-response";

/**
 * Production security headers on every response — platform pages, client
 * websites, API routes and error pages alike. It runs outermost so even a
 * crash-rendered error page is protected, and it never overwrites a header a
 * handler set on purpose.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const https = request
    ? (request.headers.get("x-forwarded-proto") ??
        new URL(request.url).protocol.replace(":", "")) === "https"
    : true;
  const result = (await next()) as unknown;
  if (result instanceof Response) return withSecurityHeaders(result, { https }) as never;
  if (result && typeof result === "object" && "response" in result) {
    const holder = result as { response: unknown };
    if (holder.response instanceof Response) {
      holder.response = withSecurityHeaders(holder.response, { https });
    }
  }
  return result as never;
});

/**
 * `revoraweb.site` is a TRAFFIC-ONLY domain: it never serves the application
 * and never serves a client website. Anything arriving on it (apex, www, or any
 * subdomain) is permanently redirected to the platform domain, preserving the
 * path and query so marketing links keep working. The target origin is
 * hardcoded, so no query parameter or header can turn this into an open
 * redirect, and the platform domain itself is never redirected, so no loop is
 * possible.
 *
 * There is deliberately NO bypass parameter: any request whose host is the
 * traffic domain is redirected, unconditionally. An earlier "already
 * redirected" query marker was removed because a visitor could supply it and
 * reach the application on the traffic domain.
 */
const trafficDomainRedirect = createMiddleware().server(async ({ next, request }) => {
  if (!request) return next();
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  if (!isTrafficDomainHost(host)) return next();
  // Only the apex and `www` redirect. Any other label under the traffic domain
  // is refused outright so it can never resemble tenant hosting.
  if (!isTrafficRedirectHost(host)) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    }) as never;
  }
  return new Response(null, {
    status: request.method === "GET" || request.method === "HEAD" ? 301 : 308,
    headers: {
      location: trafficRedirectUrl(url.pathname, url.search),
      "cache-control": "public, max-age=3600",
    },
  }) as never;
});

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  // Lovable email/webhook routes authenticate themselves — pass them through untouched.
  if (request && new URL(request.url).pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Record real production crashes so they are actionable instead of lost in
    // a log. Never let tracking failure mask the original error.
    try {
      const { captureError } = await import("./lib/monitoring.server");
      await captureError(error, {
        source: "server",
        level: "fatal",
        statusCode: 500,
        route: request ? new URL(request.url).pathname : null,
      });
    } catch {
      /* monitoring is best-effort */
    }
    return createUnhandledErrorResponse(request, renderErrorPage()) as never;
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  // The platform domain is the only application origin. `revoraweb.site` is a
  // traffic/redirect domain and is never trusted as a server-function origin.
  origin: (origin, ctx) => origin === new URL(ctx.request.url).origin,
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [
    securityHeadersMiddleware,
    trafficDomainRedirect,
    errorMiddleware,
    csrfMiddleware,
  ],
}));
