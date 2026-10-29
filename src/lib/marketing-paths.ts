/**
 * One definition of what counts as marketing traffic for revoragrowthsystems.com.
 *
 * Revora's own admin and workspace screens are staff tools, not marketing pages:
 * counting them would inflate the funnel with the owner's own clicks. Tenant
 * preview paths are customer websites, so they must never leak into platform
 * reporting either.
 *
 * The browser skips these paths when recording, and every admin report filters
 * them again, so rows recorded before this rule existed are excluded too.
 */

export const PRIVATE_PREFIXES = [
  "/app",
  "/admin",
  "/my",
  "/api",
  "/auth",
  "/onboarding",
  "/reset-password",
  "/s/",
  "/p/",
  "/draft",
  "/invite/",
] as const;


export function isPublicMarketingPath(path: string | null | undefined): boolean {
  if (!path) return true; // No path recorded — keep the row rather than lose a real visit.
  const clean = path.trim().toLowerCase();
  if (!clean.startsWith("/")) return true;
  return !PRIVATE_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(prefix));
}

/** The page a recorded event actually happened on, preferring the exact path. */
export function eventPath(row: {
  landing_path?: string | null;
  metadata?: unknown;
}): string | null {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const exact = typeof meta?.["path"] === "string" ? (meta["path"] as string) : null;
  return exact ?? row.landing_path ?? null;
}
