/**
 * One place that turns raw intake location fields into clean display text.
 *
 * Owners type locations loosely ("New York ", "ny", "Raleigh ,"), and joining
 * those values directly produced strings like "New York , Ny" on live sites.
 * This normalises spacing and upper-cases two-letter state/province codes
 * without inventing or guessing any location the owner did not supply.
 */

const tidy = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim();

/** Upper-cases short codes ("ny" -> "NY"); leaves real place names alone. */
export function formatRegion(value: string | null | undefined): string {
  const clean = tidy(value);
  if (!clean) return "";
  if (/^[A-Za-z]{2}$/.test(clean)) return clean.toUpperCase();
  return clean;
}

/** "New York " + "ny" -> "New York, NY". Empty when nothing was supplied. */
export function formatLocality(
  city: string | null | undefined,
  region?: string | null | undefined,
): string {
  const parts = [tidy(city), formatRegion(region)].filter(Boolean);
  return parts.join(", ");
}

/** Cleans a free-text service area ("Raleigh , Durham" -> "Raleigh, Durham"). */
export function formatServiceArea(value: string | null | undefined): string {
  const clean = tidy(value);
  if (!clean) return "";
  return clean
    .split(",")
    .map((part) => formatRegion(part))
    .filter(Boolean)
    .join(", ");
}

/** Service area when given, otherwise city + region. Null when unknown. */
export function localityLabel(input: {
  serviceArea?: string | null;
  city?: string | null;
  state?: string | null;
  region?: string | null;
}): string | null {
  return (
    formatServiceArea(input.serviceArea) ||
    formatLocality(input.city, input.state ?? input.region) ||
    null
  );
}
