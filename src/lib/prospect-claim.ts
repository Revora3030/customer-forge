/** Shared, browser-safe pieces of the prospect demo claim flow. */

export const CLAIM_STORAGE_KEY = "revora.getstarted.claim";

export const isClaimToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,120}$/.test(value);

/**
 * True only for a same-site path: it must start with a single "/", and
 * protocol-relative ("//evil.com"), backslash ("/\\evil.com") and absolute
 * ("https://evil.com", "javascript:") forms are rejected because browsers send
 * them to another site.
 */
export function isSafeRedirect(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.includes("\\")) return false;
  if (/^\/[^/?#]*:/.test(path)) return false;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what's being rejected.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return true;
}

/**
 * Where /auth should send someone after sign-up or sign-in. The claim token
 * rides in the redirect itself, so it survives email confirmation or a magic
 * link opened in another browser, where localStorage is empty.
 */
export function claimAwareRedirect(token: string | null | undefined): string {
  return isClaimToken(token) ? `/get-started?claim=${encodeURIComponent(token)}` : "/get-started";
}

export type ProspectClaimInfo = {
  claimable: boolean;
  businessName: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  services: string[];
};

export const NOT_CLAIMABLE: ProspectClaimInfo = {
  claimable: false,
  businessName: null,
  industry: null,
  city: null,
  state: null,
  phone: null,
  services: [],
};

/** Turns a claim_prospect_demo_server failure into plain language. */
export function claimErrorMessage(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? "";
  if (message.includes("ALREADY_HAS_WORKSPACE"))
    return "This account already has a Revora workspace. Sign up with a different email to claim this website, or contact us and we'll move it for you.";
  if (message.includes("CLAIM_NOT_AVAILABLE"))
    return "This website can't be claimed from this link anymore. It may already be claimed, or the link expired. Contact us for a fresh link.";
  if (message.includes("NOT_AUTHENTICATED") || message.includes("UNKNOWN_USER"))
    return "Please sign in again, then claim your website.";
  return "We couldn't claim this website right now. Please try again.";
}
