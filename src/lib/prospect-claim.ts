/** Shared, browser-safe pieces of the prospect demo claim flow. */

export const CLAIM_STORAGE_KEY = "revora.getstarted.claim";

export const isClaimToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,120}$/.test(value);

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
