/**
 * Real company logos via Logo.dev.
 *
 * Truth rule: a logo may only be shown for a company the customer actually
 * named (a real partner, client, supplier, or platform they genuinely use).
 * Never invent affiliations — an unnamed logo is a fabricated claim.
 */

const LOGO_DEV_HOST = "img.logo.dev";

export function isLogoDevUrl(src: string): boolean {
  try {
    return new URL(src).hostname === LOGO_DEV_HOST;
  } catch {
    return false;
  }
}

/** Build a Logo.dev URL for a company domain, with the publishable token attached. */
export function logoDevUrl(domain: string, size = 128): string {
  const token = import.meta.env['VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY'] as string | undefined;
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const params = new URLSearchParams({ size: String(size) });
  if (token) params.set("token", token);
  return `https://${LOGO_DEV_HOST}/${clean}?${params.toString()}`;
}

/**
 * Resolve a composition image source: Logo.dev URLs get the publishable
 * token appended if the AI omitted it; everything else passes through.
 */
export function resolveImageSource(src: string): string {
  if (!isLogoDevUrl(src)) return src;
  try {
    const url = new URL(src);
    if (!url.searchParams.has("token")) {
      const token = import.meta.env['VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY'] as string | undefined;
      if (token) url.searchParams.set("token", token);
    }
    return url.toString();
  } catch {
    return src;
  }
}

/**
 * Logo for the customer's OWN website domain only (from the address they
 * gave us). `fallback=404` makes Logo.dev return nothing rather than a
 * made-up monogram, so an unknown brand never gets a fake logo.
 */
export function ownDomainLogoUrl(ownWebsiteUrl: string): string {
  let host = "";
  try {
    const u = new URL(ownWebsiteUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host === "localhost") return "";
  const url = new URL(logoDevUrl(host, 256));
  url.searchParams.set("fallback", "404");
  return url.toString();
}
