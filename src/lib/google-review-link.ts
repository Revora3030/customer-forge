/**
 * Google "leave a review" link from a Google Maps place ID. The URL pattern
 * (search.google.com/local/writereview?placeid=…) is free, needs no key and
 * opens the review box directly. OpenStreetMap ids ("osm:…") are not Google
 * places and never produce a link.
 */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export function googleReviewUrl(placeId: string | null | undefined): string | null {
  const id = String(placeId ?? "").trim();
  if (!id || id.startsWith("osm:") || !PLACE_ID.test(id)) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
}

/** The place ID kept on a prospect demo (website_settings.generation.prospectDemo). */
export function placeIdFromGeneration(generation: unknown): string | null {
  const demo = (generation as { prospectDemo?: { placeId?: unknown } } | null)?.prospectDemo;
  return typeof demo?.placeId === "string" ? demo.placeId : null;
}

/** The saved review link, or the Google one when only a place ID is known. */
export function effectiveReviewLink(
  reviewLink: string | null | undefined,
  placeId: string | null | undefined,
): string | null {
  const saved = String(reviewLink ?? "").trim();
  return saved || googleReviewUrl(placeId);
}
