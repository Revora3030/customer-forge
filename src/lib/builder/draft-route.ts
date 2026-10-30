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

/**
 * Browser-tab title for an owner's private draft: the business name (and the
 * page) instead of a generic "Website draft — Revora", so several open drafts
 * can be told apart. Falls back to the generic title when the name is unknown.
 */
function headTitle(loaderData: unknown, pageSlug: string | null | undefined, kind: "draft" | "preview"): string {
  const site = (loaderData as { site?: { org?: { name?: unknown } | null } | null } | null | undefined)?.site;
  const raw = typeof site?.org?.name === "string" ? site.org.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const page = (pageSlug ?? "").trim().toLowerCase();
  const pageLabel = page && page !== "home"
    ? page.split(/[-_]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ").slice(0, 60)
    : "";
  if (!raw) {
    if (kind === "preview") return pageLabel ? `${pageLabel} — website draft preview — Revora` : "Website draft preview — Revora";
    return pageLabel ? `${pageLabel} — website page draft — Revora` : "Website draft — Revora";
  }
  return pageLabel ? `${pageLabel} · ${raw} — ${kind}` : `${raw} — ${kind}`;
}

/** Tab/OG title for the signed-in draft: names the business (and inner page) instead of a generic label. */
export function draftHeadTitle(loaderData: unknown, pageSlug?: string | null): string {
  return headTitle(loaderData, pageSlug, "draft");
}

/** Tab/OG title for a shared preview link; `result` is getPreviewSite's return value. */
export function previewHeadTitle(result: unknown, pageSlug?: string | null): string {
  return headTitle(result, pageSlug, "preview");
}
