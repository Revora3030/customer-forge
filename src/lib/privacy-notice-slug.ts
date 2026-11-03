/**
 * Addresses of a client website's privacy notice.
 *
 * Every published client site serves a generated privacy and cookie notice at
 * /privacy-notice (src/lib/client-privacy-notice.ts), built only from facts the
 * owner entered. A builder page at that slug replaces it.
 *
 * The AI builder can also author a page at /privacy or /privacy-policy. To
 * avoid two different privacy texts on one site, the generated notice is
 * preferred: links to those slugs point at /privacy-notice, and visits to them
 * on the platform address or the owner's domain are redirected there. (On the
 * owner's domain /privacy itself would otherwise open Revora's own policy.)
 */
export const PRIVACY_NOTICE_SLUG = "privacy-notice";

/**
 * Whether a published client site has a privacy notice. Always true: the
 * generated notice is served for every published site (and a builder page at
 * /privacy-notice replaces it), so launch checks count it as present.
 */
export function siteServesPrivacyNotice(): true {
  return true;
}

/** Builder page slugs that duplicate the generated notice. */
export const DUPLICATE_PRIVACY_SLUGS: readonly string[] = ["privacy", "privacy-policy"];

export function isDuplicatePrivacySlug(slug: string | null | undefined): boolean {
  return DUPLICATE_PRIVACY_SLUGS.includes((slug ?? "").trim().toLowerCase());
}

/** Rewrites an in-site "/privacy" or "/privacy-policy" href (keeping ?query or #hash) to "/privacy-notice". */
export function preferPrivacyNoticeHref(href: string): string {
  return href.replace(/^\/(?:privacy|privacy-policy)\/?(?=[?#]|$)/i, `/${PRIVACY_NOTICE_SLUG}`);
}
