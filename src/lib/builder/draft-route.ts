/**
 * True when a /draft/<slug>/... address is for one of the draft's inner pages
 * (e.g. /draft/acme/services), not the draft home page.
 *
 * The draft home route is the parent of every draft page, so without this
 * check opening /services also loaded the whole home draft first and the page
 * stayed blank until both finished.
 */
export function isDraftChildPath(pathname: string, slug: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? "";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "draft" || parts.length < 3) return false;
  let decoded = parts[1]!;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }
  return decoded === slug && parts[2] !== "home";
}

/** Shown while a draft page loads, so the preview is never a blank screen. */
export const DRAFT_PENDING_MS = 150;
