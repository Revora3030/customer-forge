/**
 * `/draft/<slug>` and `/draft/<slug>/<page>` render only in the browser (the
 * signed-in area has no server render), so the server used to answer 200 for
 * any slug. The server entry now asks whether the business address exists at
 * all and, if it does not, sends the same app shell with HTTP 404.
 *
 * Nothing private is involved: the check reads only whether an organization
 * with that slug exists (never draft content), the body is the unchanged
 * client shell, and any lookup failure keeps the normal 200 so signed-in
 * previews can never be broken by it.
 */

const DRAFT_PATH = /^\/draft\/([a-z0-9-]+)(?:\/[^/]+)?\/?$/;

/** The business slug in a draft address, or null for any other path. */
export function draftSlugFromPath(pathname: string): string | null {
  return DRAFT_PATH.exec(pathname)?.[1] ?? null;
}

export type SlugLookup = (slug: string) => Promise<boolean | null>;

/**
 * Returns the response to send: a 404 copy of an HTML 200 response for a draft
 * address whose business does not exist, otherwise the response unchanged.
 * `exists` answers true/false, or null when it could not tell.
 */
export async function applyDraft404(request: Request, response: Response, exists: SlugLookup): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  if (response.status !== 200) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const slug = draftSlugFromPath(new URL(request.url).pathname);
  if (!slug) return response;
  let found: boolean | null;
  try {
    found = await exists(slug);
  } catch {
    found = null;
  }
  if (found !== false) return response;
  return new Response(response.body, { status: 404, statusText: "Not Found", headers: response.headers });
}
