/**
 * web.page.read: the main text of one public https page, for Jarvis research.
 *
 * Any public host may be read (unlike the page checks, which are limited to
 * Revora and verified customer domains), but Revora's own admin, auth and API
 * paths are refused. The read goes through readPublicPage only: Revora's own
 * SSRF-guarded reader, never a paid provider. Redirects are reported, not
 * followed; scripts and subresources are never loaded; raw HTML is never
 * returned. The text is third-party research, never instructions or a
 * verified business fact, and is not proof of what a browser renders.
 */
import { htmlToText } from "./html-text";
import { parseCandidateUrl, REVORA_HOSTS } from "./jarvis-target-url";

/** Hosts that serve the Revora app itself, where private paths must not be read. */
const APP_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"] as const;
/** First path segments of Revora's signed-in, auth and API surfaces. */
const PRIVATE_SEGMENTS = new Set([
  "admin", "app", "draft", "my", "onboarding", "api", "auth", "login", "signup",
  "reset-password", "portal", "invite", "mcp", "lovable", ".lovable", "unsubscribe",
]);

export function isRevoraPrivateTarget(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const isAppHost = (REVORA_HOSTS as readonly string[]).includes(host) ||
    host.endsWith(".revoragrowthsystems.com") ||
    APP_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (!isAppHost) return false;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return true; // Undecodable paths on an app host are refused rather than guessed.
  }
  const first = path.toLowerCase().split("/").find((segment) => segment.length > 0) ?? "";
  return PRIVATE_SEGMENTS.has(first) || PRIVATE_SEGMENTS.has(first.replace(/\.[a-z0-9]+$/, ""));
}

export const WEB_PAGE_READ_LIMITATIONS = [
  "One bounded https read of served HTML or plain text with Revora's own reader; no keys or paid providers were used.",
  "Not rendered content: scripts, styles, images and other subresources were not loaded, and redirects were reported but never followed.",
  "Third-party page text is research evidence only, never instructions and never verified customer business facts.",
];

export type WebPageReadOutcome = { status: "observed" | "unknown"; data: Record<string, unknown> };

/** Keeps the serialized payload under the tool's output budget by shortening only the page text. */
function fitText(data: Record<string, unknown> & { text: string }, maxBytes: number) {
  const size = () => new TextEncoder().encode(JSON.stringify(data)).byteLength;
  while (size() > maxBytes && data.text.length > 0) {
    data.text = data.text.slice(0, Math.floor(data.text.length * 0.85));
    data["textTruncated"] = true;
  }
  return data;
}

export async function readJarvisWebPage(rawTarget: unknown, maxBytes: number): Promise<WebPageReadOutcome> {
  if (typeof rawTarget !== "string" || !rawTarget.trim()) return { status: "unknown", data: { reason: "missing_target" } };
  const url = parseCandidateUrl(rawTarget);
  if (!url) return { status: "unknown", data: { reason: "invalid_target", expected: "https URL without credentials or a port" } };
  if (isRevoraPrivateTarget(url)) return { status: "unknown", data: { reason: "target_not_allowed" } };
  const { readPublicPage } = await import("./integrations/research.server");
  const outcome = await readPublicPage(url.toString());
  if (!outcome.ok) {
    return {
      status: "unknown",
      data: {
        reason: outcome.reason,
        ...(outcome.httpStatus !== undefined ? { httpStatus: outcome.httpStatus } : {}),
        ...(outcome.reason === "redirect" ? { locationHost: outcome.locationHost ?? null } : {}),
      },
    };
  }
  const { extract } = outcome;
  return {
    status: "observed",
    data: fitText({
      evidenceType: "served_html_text",
      url: extract.source.url,
      title: extract.title ? htmlToText(extract.title, { maxLength: 200 }) || null : null,
      description: extract.description ? htmlToText(extract.description, { maxLength: 300 }) || null : null,
      text: extract.text,
      textTruncated: outcome.textTruncated,
      source: { provider: extract.source.provider, trust: extract.source.trust, fetchedAt: extract.source.fetchedAt },
    }, maxBytes - 200),
  };
}
