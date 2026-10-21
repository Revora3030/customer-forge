import { INSTAGRAM_CALLBACK } from "./instagram-post";

const GRAPH = "https://graph.instagram.com/v26.0";
export class InstagramProviderError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Instagram request failed (${status}): ${detail}`);
  }
}
/** Never log raw responses: token exchanges may contain credentials. */
async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; }
  catch { throw new InstagramProviderError(response.status, "Instagram returned an unreadable response."); }
  if (!response.ok || body["error"]) {
    const error = body["error"];
    const detail = error && typeof error === "object" ? (error as Record<string, unknown>)["message"] : body["error_message"];
    // Provider messages can echo request parameters; never expose a token.
    const safe = typeof detail === "string" ? detail.replace(/(?:IG|EAA)[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 500) : "Authorization or publishing request rejected.";
    throw new InstagramProviderError(response.status, safe);
  }
  return body;
}
export async function instagramGraph(token: string, path: string, fields?: Record<string, string>) {
  if (!/^\/[0-9]+(?:\/(?:media|media_publish|permissions))?$/.test(path) && path !== "/me") throw new Error("Invalid Instagram operation.");
  const url = new URL(`${GRAPH}${path}`);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (fields) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (!fields) url.searchParams.set("fields", path === "/me" ? "user_id,username" : "id,permalink,status_code");
  return readResponse(await fetch(url, { method: fields ? "POST" : "GET", headers, ...(fields ? { body: new URLSearchParams(fields) } : {}), signal: AbortSignal.timeout(30000), redirect: "error" }));
}
export async function exchangeInstagramCode(code: string) {
  const id = process.env["INSTAGRAM_APP_ID"], secret = process.env["INSTAGRAM_APP_SECRET"];
  if (!id || !secret) throw new Error("Instagram app credentials are missing.");
  const short = await readResponse(await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST", body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: INSTAGRAM_CALLBACK, code }),
    signal: AbortSignal.timeout(30000), redirect: "error",
  }));
  if (typeof short["access_token"] !== "string") throw new Error("Instagram did not return authorization.");
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("access_token", short["access_token"]);
  const long = await readResponse(await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "error" }));
  if (typeof long["access_token"] !== "string" || typeof long["expires_in"] !== "number") throw new Error("Instagram authorization was incomplete.");
  return { token: long["access_token"], expiresIn: long["expires_in"] };
}