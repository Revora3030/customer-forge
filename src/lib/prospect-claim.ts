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

/**
 * The redirect for a visitor who clicked "Pay" before having an account:
 * /get-started with `pay=now`, so checkout resumes automatically once they are
 * signed in (after sign-up, email confirmation or a magic link). Any claim
 * token rides along exactly as in claimAwareRedirect.
 */
export function checkoutResumeRedirect(token: string | null | undefined): string {
  const base = claimAwareRedirect(token);
  return `${base}${base.includes("?") ? "&" : "?"}pay=now`;
}

/**
 * Where an email confirmation or magic link lands. A confirmed user always
 * comes back through /auth first: there the session from the link is picked
 * up, the profile is saved (ensureProfile), the redirect is checked again with
 * isSafeRedirect, and the user continues signed in to /get-started (with any
 * claim token or `pay=now` intact) or to their workspace at /app. Landing
 * straight on a protected page would skip that profile step. Only a same-site
 * redirect is carried; anything else is dropped so /auth picks the next step.
 */
export function authEmailRedirectTo(origin: string, redirect: string | null | undefined): string {
  const base = `${origin.replace(/\/+$/, "")}/auth`;
  return redirect && isSafeRedirect(redirect)
    ? `${base}?redirect=${encodeURIComponent(redirect)}`
    : base;
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

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "msn.com", "gmx.com", "mail.com", "yandex.com", "zoho.com"]);

export type ClaimOwnership = { allowed: true; verified: boolean; method: "email_match" | "domain_match" | "no_contact_on_file" } | { allowed: false; hint: string };

/**
 * Who may claim a prospect demo. Holding the preview link is not enough when
 * the business's public email is on file: the claimant's account email must be
 * that address or share its own (non-free-mail) business domain, so a
 * forwarded link can't hand the business's site to a stranger.
 */
export function claimOwnership(businessEmail: string | null | undefined, claimantEmail: string | null | undefined): ClaimOwnership {
  const biz = (businessEmail ?? "").trim().toLowerCase();
  const me = (claimantEmail ?? "").trim().toLowerCase();
  if (!biz.includes("@")) return { allowed: true, verified: false, method: "no_contact_on_file" };
  if (me && me === biz) return { allowed: true, verified: true, method: "email_match" };
  const domain = biz.split("@")[1]!;
  if (me && !FREE_MAIL.has(domain) && me.split("@")[1] === domain) return { allowed: true, verified: true, method: "domain_match" };
  const [user] = biz.split("@");
  return { allowed: false, hint: `${user!.slice(0, 1)}***@${domain}` };
}
