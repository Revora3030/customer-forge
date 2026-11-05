/**
 * Item 18: every /p/:token demo preview shows this label, and expired/invalid
 * tokens show a plain expired page. The generated site cannot hide the label
 * (it lives outside PublicSiteView with inline styles and a max z-index).
 */

/** Exact copy Adam's brief / item 18 requires on every demo preview. */
export const DEMO_PREVIEW_LABEL_TEXT = "Demo preview — not approved by the business";

/** Height reserved so site content is not covered by the fixed label. */
export const DEMO_PREVIEW_LABEL_OFFSET_PX = 40;

/** CTA on the expired / invalid preview page. */
export const DEMO_PREVIEW_EXPIRED_HREF = "/get-started";

export type DeadPreviewReason = "expired" | "revoked" | "unknown" | string;

/**
 * Plain copy for a dead /p/:token link. Expired and invalid tokens share the
 * same title so the page never leaks whether the token once existed.
 */
export function demoPreviewExpiredCopy(_reason?: DeadPreviewReason): {
  title: string;
  body: string;
  href: string;
  cta: string;
} {
  return {
    title: "This preview has expired",
    body: "This preview link is no longer available. You can start a free trial anytime.",
    href: DEMO_PREVIEW_EXPIRED_HREF,
    cta: "Get started",
  };
}
