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
