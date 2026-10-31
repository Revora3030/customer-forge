/**
 * Which GA4 properties revoragrowthsystems.com reports to.
 *
 * Revora's own property (G-WC1X5HWN7W, the revoragrowthsystems.com web stream)
 * is the single GA4 ID on production, so a stale or mistyped ID saved in
 * Admin → Analytics can never silently send all traffic somewhere else.
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

/**
 * Exactly one GA4 property is loaded: Revora's own. A different ID saved in
 * Admin → Analytics is not sent to (the founder picks the one ID to keep; the
 * default stays until then), so the page never configures two properties.
 */
export function resolveGaMeasurementIds(_saved?: unknown): string[] {
  return [DEFAULT_GA_MEASUREMENT_ID];
}
