/**
 * Keep failed API responses machine-readable without leaking server exception
 * details. Browser/page requests retain the branded HTML error response.
 */
export function createUnhandledErrorResponse(
  request: Request | undefined,
  htmlErrorPage: string,
): Response {
  if (request && new URL(request.url).pathname.startsWith("/api/")) {
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(htmlErrorPage, {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * TanStack Start throws these when a `/_serverFn/<id>` request names a server
 * function the running server cannot resolve: "Invalid server function ID" from
 * the dev/preview server (Lovable preview), "Server function info not found"
 * from a production build. The browser is holding a client bundle whose function
 * ID the server does not know (old tab after a deploy, or a preview server that
 * restarted or failed one lazy compile). It is not an application crash, and a
 * reload of the page fixes it.
 */
const UNRESOLVED_SERVER_FN_MESSAGES = [
  /^Invalid server function ID\b/i,
  /^Server function info not found for\b/i,
  /^Server function module (?:export )?not resolved\b/i,
];

export function isUnresolvedServerFnError(request: Request | undefined, error: unknown): boolean {
  if (!request || !(error instanceof Error)) return false;
  if (!new URL(request.url).pathname.startsWith("/_serverFn/")) return false;
  return UNRESOLVED_SERVER_FN_MESSAGES.some((pattern) => pattern.test(error.message));
}

/**
 * Plain-text 404 for an unresolved server function. The client RPC turns a
 * non-OK body into `new Error(body)`, so the body keeps the wording the client's
 * stale-build recovery recognises (`isStaleDeployError`) instead of the branded
 * HTML error page, which no client code can classify. No ID, stack or server
 * detail is echoed back.
 */
export function createUnresolvedServerFnResponse(): Response {
  return new Response("Invalid server function ID: reload the page to load the current version.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
