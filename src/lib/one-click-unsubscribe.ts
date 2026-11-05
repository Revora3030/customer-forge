/**
 * RFC 8058 one-click unsubscribe: the mail client POSTs the body
 * "List-Unsubscribe=One-Click" to the https List-Unsubscribe URL, as
 * application/x-www-form-urlencoded or multipart/form-data, and reads only the
 * status. A browser form post (the page's button) carries no such field.
 */
export async function isOneClickUnsubscribe(request: Request): Promise<boolean> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("application/x-www-form-urlencoded") && !type.includes("multipart/form-data")) return false;
  const form = await request.formData().catch(() => null);
  return form?.get("List-Unsubscribe") === "One-Click";
}

/** The response for an unsubscribe POST: bare status for one-click, else back to the page. */
export function unsubscribeResponse(request: Request, oneClick: boolean, done: boolean): Response {
  if (oneClick) return new Response(null, { status: done ? 200 : 404 });
  const url = new URL(request.url);
  url.search = done ? "?done=1" : "?invalid=1";
  return Response.redirect(url.toString(), 303);
}
