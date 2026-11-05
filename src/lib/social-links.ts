import { safeLinkUrl } from "@/lib/website-content";

/**
 * A social profile link the owner really gave, or null. Empty values and
 * placeholder URLs (seed data such as instagram.com/example, *.example hosts,
 * example.com/org/net) are dropped so a site never links to a stand-in profile.
 */
export function isPlaceholderSocialUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "example" || host.endsWith(".example")) return true;
  if (/(^|\.)example\.(com|org|net)$/.test(host)) return true;
  const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  return first === "example" || first === "@example";
}

export function ownerSocialUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = safeLinkUrl(value);
  if (!href || !/^https?:/i.test(href)) return null;
  return isPlaceholderSocialUrl(href) ? null : href;
}
