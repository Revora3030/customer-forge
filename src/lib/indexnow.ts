/**
 * IndexNow: tells Bing (which also feeds ChatGPT search and Copilot), Yandex,
 * Seznam and Naver about new or changed pages on revoragrowthsystems.com within
 * minutes, instead of waiting for the next crawl.
 *
 * The key is not a secret. IndexNow proves ownership by fetching it from
 * `keyLocation` on the same host, so it is published at /indexnow-key.txt.
 * It is derived from the host, so the key file and the submission always
 * agree without any setup; INDEXNOW_KEY overrides it if it is ever rotated.
 */

export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** IndexNow accepts at most 10,000 URLs per request. */
export const INDEXNOW_MAX_URLS = 10_000;

const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;

export async function indexNowKey(host: string, override?: string | null): Promise<string> {
  const key = override?.trim();
  if (key && KEY_PATTERN.test(key)) return key;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`revora-indexnow:${host.toLowerCase().split(":")[0]}`),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The request body for one host. Every URL must be on `origin`'s host, or the
 * whole batch is rejected, so anything else is dropped here.
 */
export function indexNowPayload(origin: string, urls: readonly string[], key: string) {
  const host = new URL(origin).host;
  const urlList = [
    ...new Set(
      urls.filter((url) => {
        try {
          return new URL(url).host === host;
        } catch {
          return false;
        }
      }),
    ),
  ].slice(0, INDEXNOW_MAX_URLS);
  return { host, key, keyLocation: `${origin}${INDEXNOW_KEY_PATH}`, urlList };
}

/** What each IndexNow status code means, in plain words. */
export function describeIndexNowStatus(status: number): { ok: boolean; message: string } {
  if (status === 200 || status === 202)
    return { ok: true, message: "Bing and the other IndexNow search engines accepted every page." };
  if (status === 403)
    return { ok: false, message: "IndexNow couldn't read the key file yet. Publish the site, then try again." };
  if (status === 422)
    return { ok: false, message: "IndexNow rejected the list because a page wasn't on revoragrowthsystems.com." };
  if (status === 429)
    return { ok: false, message: "IndexNow asked Revora to slow down. Try again in an hour." };
  return { ok: false, message: `IndexNow answered with status ${status}. Try again later.` };
}
