/** Safe base-URL check for the owner's OmniRoute server (no imports, so free.ts can use it). */

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Normalised https base URL (no trailing slash), or null when unsafe/invalid. */
export function safeOmniRouteBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (PRIVATE_HOST.test(url.hostname)) return null;
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

