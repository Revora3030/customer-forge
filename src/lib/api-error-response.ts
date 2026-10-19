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
