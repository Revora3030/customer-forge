/**
 * REVORA ADDRESSES.
 *
 * There are exactly three kinds of web address in this product:
 *
 *   1. `revoragrowthsystems.com` — the ONLY Revora platform domain (dashboard,
 *      builder, billing, CRM) and the host of every client share/preview path
 *      at `/s/<slug>`.
 *   2. `revoraweb.site` — TRAFFIC ONLY. The apex, `www`, and every possible
 *      label under it exist solely to redirect visitors to the platform domain.
 *      It is never an application origin and never hosts a website.
 *   3. A customer-owned domain, verified for DNS and HTTPS — the client's real
 *      public website address.
 *
 * Revora-branded client subdomains do not exist. There is intentionally no
 * helper in this module that can build, claim, check or resolve one; any such
 * host is structurally rejected as a tenant.
 *
 * Browser-safe: pure string work only.
 */

/** Revora's own platform domain. Client websites are never served from here. */
export const REVORA_ROOT = "revoragrowthsystems.com";

/**
 * The traffic/redirect-only domain. Nothing is hosted on it — see
 * `isTrafficDomainHost` / `trafficRedirectUrl`.
 */
export const SITE_ROOT = "revoraweb.site";

/** Hosts that belong to Revora itself, never to a client site. */
export const REVORA_OWN_HOSTS = [
  REVORA_ROOT,
  `www.${REVORA_ROOT}`,
  SITE_ROOT,
  `www.${SITE_ROOT}`,
  "customer-forge.lovable.app",
];

/**
 * TRAFFIC-ONLY DOMAIN.
 *
 * `revoraweb.site` (apex, `www`, and any subdomain) exists solely to send
 * visitors to the platform domain. It is never an application origin and never
 * hosts a client website; every request on it is permanently redirected.
 */
export function isTrafficDomainHost(rawHost: string | null | undefined) {
  const host = String(rawHost ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .split(":")[0]!
    .replace(/\.+$/, "");
  return host === SITE_ROOT || host.endsWith(`.${SITE_ROOT}`);
}

/**
 * Only the apex and `www` form of the traffic domain are served at all, and
 * only as a redirect. Every other label under it (including nested ones such as
 * `a.b.revoraweb.site`) is refused with a 404 so no host under the traffic
 * domain can ever look like a hosted website.
 */
export function isTrafficRedirectHost(rawHost: string | null | undefined) {
  const host = normalizeHost(rawHost);
  return host === SITE_ROOT || host === `www.${SITE_ROOT}`;
}

/** The single safe redirect target for traffic-domain requests. */
export function trafficRedirectUrl(pathname: string, search = "") {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  // The origin is fixed, so no visitor-supplied value can ever redirect off
  // the platform. Path/query are carried through unchanged and inert.
  return `https://${REVORA_ROOT}${path}${search}`;
}

export function normalizeHost(host: string | null | undefined) {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .split(":")[0]!
    .replace(/\.+$/, "");
}

/**
 * Revora's marketing site, previews and local development are never tenants.
 * Every label under the platform domain belongs to Revora too, so no
 * `something.revoragrowthsystems.com` host can ever be claimed as a client
 * website address.
 */
export function isRevoraOwnHost(rawHost: string | null | undefined) {
  const host = normalizeHost(rawHost);
  if (!host) return true;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;
  if (host.endsWith("lovable.app") || host.endsWith("lovableproject.com")) return true;
  if (host === REVORA_ROOT || host.endsWith(`.${REVORA_ROOT}`)) return true;
  return REVORA_OWN_HOSTS.includes(host);
}

/**
 * True only when a host could be a customer-owned domain. Revora's own hosts and
 * every `revoraweb.site` host are excluded, so no lookup is ever attempted for
 * them.
 */
export function isPossibleTenantHost(rawHost: string | null | undefined) {
  return !isRevoraOwnHost(rawHost) && !isTrafficDomainHost(rawHost);
}

/**
 * A custom domain is only ever presented as active once DNS and HTTPS have both
 * been verified. Until then the platform share path is the live address.
 */
export function customDomainIsLive(settings: {
  custom_domain?: string | null;
  dns_ok?: boolean | null;
  ssl_ok?: boolean | null;
}) {
  return !!settings.custom_domain && !!settings.dns_ok && !!settings.ssl_ok;
}

/**
 * The ALWAYS-WORKING client website address.
 *
 * A customer's own domain needs its own certificate, so it is only handed out
 * once a real DNS + HTTPS probe confirms it answers. Every published client site
 * is additionally, and permanently, reachable at a path on the platform
 * domain — that address needs no DNS, no certificate and no purchase.
 */
export const PLATFORM_ORIGIN = `https://${REVORA_ROOT}`;

export function clientSitePath(orgSlug: string | null | undefined) {
  const slug = String(orgSlug ?? "").trim();
  return slug ? `/s/${slug}` : null;
}

export function clientSiteUrl(orgSlug: string | null | undefined) {
  const path = clientSitePath(orgSlug);
  return path ? `${PLATFORM_ORIGIN}${path}` : null;
}

/**
 * Revora-owned subdomain hosting is permanently retired. The constant is kept
 * only so anything reading it (docs, tests, edge config) sees a hard `false`;
 * no code path can turn it back on because the supporting helpers no longer
 * exist. Do NOT reintroduce `*.revoraweb.site` client hosting.
 */
export const REVORA_SUBDOMAIN_HOSTING_ENABLED = false;

/**
 * The verified hostname visitors should use today, or null when the client has
 * not verified a domain of their own yet. Only a customer-owned domain qualifies.
 */
export function primaryAddress(settings: {
  custom_domain?: string | null;
  dns_ok?: boolean | null;
  ssl_ok?: boolean | null;
}) {
  return customDomainIsLive(settings) ? settings.custom_domain! : null;
}

/**
 * The single address to show a client: their verified domain when one exists,
 * otherwise the platform path address that always works.
 */
export function liveAddressUrl(
  settings: {
    custom_domain?: string | null;
    dns_ok?: boolean | null;
    ssl_ok?: boolean | null;
  },
  orgSlug: string | null | undefined,
) {
  const host = primaryAddress(settings);
  if (host) return { url: `https://${host}`, label: host, kind: "hostname" as const };
  const url = clientSiteUrl(orgSlug);
  return url
    ? { url, label: url.replace(/^https:\/\//, ""), kind: "path" as const }
    : { url: null, label: null, kind: "none" as const };
}

/**
 * The one address search engines should index for a client page.
 *
 * A published site can be reached from two places at once (the client's own
 * domain and the always-working platform path). Search engines must be told
 * which one is the real home. Order of truth: an explicit canonical the client
 * set, then their verified domain, then the platform path.
 */
export function canonicalSiteUrl(
  settings: {
    custom_domain?: string | null;
    dns_ok?: boolean | null;
    ssl_ok?: boolean | null;
  } | null,
  orgSlug: string | null | undefined,
  pageSlug?: string | null,
  explicitCanonical?: string | null,
) {
  const explicit = String(explicitCanonical ?? "").trim();
  if (explicit.startsWith("https://")) return explicit;

  const page = String(pageSlug ?? "").trim();
  const isHome = !page || page === "home" || page === "index";
  const host = settings ? primaryAddress(settings) : null;
  if (host) return isHome ? `https://${host}` : `https://${host}/${page}`;

  const base = clientSiteUrl(orgSlug);
  if (!base) return null;
  return isHome ? base : `${base}/${page}`;
}

/**
 * Paths that belong to REVORA ONLY — the marketing site, the dashboard, sign-in,
 * billing and the share/preview paths.
 *
 * A client's own domain must never serve any of these: a visitor on
 * `joesplumbing.com/pricing` sees Joe's prices, and `joesplumbing.com/get-started`
 * is simply a page that doesn't exist on Joe's website rather than Revora's
 * signup form. Paths shared with client websites (`/`, `/about`, `/contact`,
 * `/pricing`, and any single-segment client page) are deliberately absent here —
 * those routes resolve the client's own page themselves.
 */
const REVORA_ONLY_PREFIXES = [
  "/app",
  "/admin",
  "/my",
  "/auth",
  "/portal",
  "/onboarding",
  "/get-started",
  "/reset-password",
  "/invite",
  "/share",
  "/s/",
  "/p/",
  "/demo",
  "/guides",
  "/industries",
  "/locations",
  "/local",
  "/states",
  "/compare",
  "/crm",
  "/tools",
  "/website-audit",
  "/growth-assessment",
  "/privacy",
  "/terms",
];

/** True when this path is Revora's own and must 404 on a client's domain. */
export function isRevoraOnlyPath(pathname: string | null | undefined) {
  const path = String(pathname ?? "").toLowerCase();
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return REVORA_ONLY_PREFIXES.some(
    (prefix) =>
      clean === prefix.replace(/\/$/, "") ||
      clean.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}
