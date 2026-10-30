/**
 * Explicit 405 for POST-only API routes.
 *
 * Without a GET handler, a browser or crawler GET on a POST-only endpoint
 * falls through to the app shell and is answered with 200 homepage HTML,
 * which hides real misconfigurations (e.g. a scheduler accidentally using
 * GET) and looks like a working page to scanners.
 */
export function methodNotAllowed(allow: readonly string[] = ["POST"]): Response {
  return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
    status: 405,
    headers: {
      allow: allow.join(", "),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
