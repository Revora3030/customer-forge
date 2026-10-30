/**
 * Which GA4 properties revoragrowthsystems.com reports to.
 *
 * Revora's own property (G-WC1X5HWN7W, the revoragrowthsystems.com web stream)
 * is ALWAYS included on production, so a stale or mistyped ID saved in
 * Admin → Analytics can never silently send all traffic somewhere else. A
 * different valid ID saved by an admin is configured as an additional
 * destination on the same gtag.js load.
 *
 * Pure and shared by the server function and the browser loader.
 */
export const DEFAULT_GA_MEASUREMENT_ID = "G-WC1X5HWN7W";

export const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

export function normalizeGaMeasurementId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return GA_MEASUREMENT_ID_PATTERN.test(id) ? id : null;
}

/** Default first, then the saved ID when it is valid and different. */
export function resolveGaMeasurementIds(saved: unknown): string[] {
  const extra = normalizeGaMeasurementId(saved);
  return extra && extra !== DEFAULT_GA_MEASUREMENT_ID
    ? [DEFAULT_GA_MEASUREMENT_ID, extra]
    : [DEFAULT_GA_MEASUREMENT_ID];
}
