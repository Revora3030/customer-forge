/**
 * Google Maps listing photos for prospect demos.
 *
 * Google's terms allow showing Places photos live with credit to the person
 * who took them, but not saving copies. So a demo stores only the place ID
 * (allowed) and one media row per photo whose URL is our own photo path; that
 * path asks Google for a fresh photo address on each request. Photos can come
 * from customers as well as the owner, so every one is credited by name.
 */

export const MAX_MAPS_PHOTOS = 8;
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MapsPhotoRef = { name: string; author: string | null };

export function isPlaceId(value: unknown): value is string {
  return typeof value === "string" && PLACE_ID.test(value);
}

/** Reads the `photos` field of a Places (New) details response. */
export function parsePlacePhotos(payload: unknown): MapsPhotoRef[] {
  const photos = (payload as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(photos)) return [];
  const out: MapsPhotoRef[] = [];
  for (const photo of photos) {
    const name = (photo as { name?: unknown })?.name;
    if (typeof name !== "string" || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) continue;
    const authors = (photo as { authorAttributions?: unknown }).authorAttributions;
    const first = Array.isArray(authors) ? (authors[0] as { displayName?: unknown } | undefined) : undefined;
    const author = typeof first?.displayName === "string" ? first.displayName.replace(/\s+/g, " ").trim().slice(0, 80) || null : null;
    out.push({ name, author });
    if (out.length >= MAX_MAPS_PHOTOS) break;
  }
  return out;
}

/** The visible label: what the photo is and who took it. */
export function mapsPhotoLabel(businessName: string, author: string | null): string {
  const credit = author ? `photo by ${author} on Google Maps` : "photo from Google Maps";
  return `${businessName.trim()}, ${credit}`.slice(0, 200);
}

export function mapsPhotoPath(organizationId: string, index: number): string {
  return `/api/public/maps-photo/${organizationId}/${index}`;
}

export function parseMapsPhotoPath(orgId: string, index: string): { organizationId: string; index: number } | null {
  if (!ORG_ID.test(orgId) || !/^\d{1,2}$/.test(index)) return null;
  const n = Number(index);
  return n < MAX_MAPS_PHOTOS ? { organizationId: orgId.toLowerCase(), index: n } : null;
}
