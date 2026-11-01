/**
 * The builder's own server-rendered preview (PR3 "fast first paint").
 *
 * The builder frame used to load `/draft/:slug`, a signed-in, browser-only
 * route: the frame showed "Loading your draft…" until the app bundle, the
 * session check and the draft query had all finished, and only then drew the
 * site. `/p/:token` renders the same unpublished draft on the server, so the
 * frame paints the real page from the first HTML bytes.
 *
 * The builder mints an ordinary private preview link for itself (managers and
 * owners only, the same check as "Share preview"), marked with a fixed label so:
 * - it is hidden from the owner's list of shared links,
 * - `/p` renders it in builder mode: simulated forms (no real enquiries from
 *   the owner's own clicks), element picking, no prospect bar or view beacon.
 *
 * The marker is a label, not a column, because this change ships without a
 * database migration. While a build or AI update runs, the builder keeps using
 * `/draft`, which knows how to hold the previous version and poll for progress.
 */

/** Fixed label of the builder's own preview link (fits the 120-character label limit). */
export const BUILDER_PREVIEW_LABEL = "Builder live preview · private · rv-builder";

/** How long a builder link lives. Re-minted well before it runs out. */
export const BUILDER_PREVIEW_HOURS = 8;

/** A cached link with less than this left is replaced, so a long session never meets an expired frame. */
export const BUILDER_PREVIEW_REFRESH_MS = 30 * 60_000;

export function isBuilderPreviewLabel(label: unknown): boolean {
  return typeof label === "string" && label.trim() === BUILDER_PREVIEW_LABEL;
}

/** The share-link list never shows the builder's own link. */
export function withoutBuilderLinks<T extends { label: string | null }>(links: readonly T[]): T[] {
  return links.filter((link) => !isBuilderPreviewLabel(link.label));
}

export type BuilderPreviewToken = { token: string; expiresAt: string };

const TOKEN = /^[a-z0-9]{20,80}$/i;

/** A cached token is usable only while it has comfortably more than the refresh margin left. */
export function isFreshBuilderToken(value: unknown, now = Date.now()): value is BuilderPreviewToken {
  if (!value || typeof value !== "object") return false;
  const { token, expiresAt } = value as Partial<BuilderPreviewToken>;
  if (typeof token !== "string" || !TOKEN.test(token)) return false;
  const expires = Date.parse(String(expiresAt ?? ""));
  return Number.isFinite(expires) && expires - now > BUILDER_PREVIEW_REFRESH_MS;
}

export function builderTokenStorageKey(organizationId: string): string {
  return `rv:builder-preview:${organizationId}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Reads this tab's cached builder link (sessionStorage: gone when the tab closes). */
export function readCachedBuilderToken(storage: StorageLike | null | undefined, organizationId: string, now = Date.now()): BuilderPreviewToken | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(builderTokenStorageKey(organizationId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isFreshBuilderToken(parsed, now)) return { token: parsed.token, expiresAt: parsed.expiresAt };
    storage.removeItem(builderTokenStorageKey(organizationId));
    return null;
  } catch {
    return null;
  }
}

export function writeCachedBuilderToken(storage: StorageLike | null | undefined, organizationId: string, value: BuilderPreviewToken): void {
  if (!storage) return;
  try {
    storage.setItem(builderTokenStorageKey(organizationId), JSON.stringify(value));
  } catch {
    /* private mode or full storage: the link is simply minted again */
  }
}

/** `/p/<token>` for the home page, `/p/<token>/<page>` for any other page. */
export function builderPreviewPath(token: string, pageSlug: string | null | undefined): string {
  const base = `/p/${encodeURIComponent(token)}`;
  const page = String(pageSlug ?? "").trim();
  return !page || page === "home" ? base : `${base}/${encodeURIComponent(page)}`;
}

/**
 * Which address the builder frame loads. The server-rendered `/p` page is used
 * whenever a builder link exists and no build is running; during a build the
 * signed-in `/draft` page shows the held version and progress instead.
 */
export function builderFrameSource(input: {
  draftPath: string;
  token: string | null | undefined;
  pageSlug: string | null | undefined;
  buildActive: boolean;
}): string {
  if (!input.token || input.buildActive) return input.draftPath;
  return builderPreviewPath(input.token, input.pageSlug);
}
