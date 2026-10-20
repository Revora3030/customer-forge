import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_MAPS_PHOTOS,
  isPlaceId,
  mapsPhotoLabel,
  mapsPhotoPath,
  parseMapsPhotoPath,
  parsePlacePhotos,
  type MapsPhotoRef,
} from "@/lib/maps-photos";

async function placesGet(path: string, fieldMask?: string): Promise<unknown> {
  const ownKey = process.env["GOOGLE_PLACES_API_KEY"]?.trim();
  const headers: Record<string, string> = fieldMask ? { "X-Goog-FieldMask": fieldMask } : {};
  let response: Response;
  if (ownKey) {
    response = await fetch(`https://places.googleapis.com${path}`, {
      headers: { ...headers, "X-Goog-Api-Key": ownKey },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } else {
    const { placesGatewayGet } = await import("@/lib/integrations/google.server");
    return placesGatewayGet(path, fieldMask);
  }
  if (!response.ok) throw new Error(`Google Places photos failed [${response.status}]: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

/** Live photo list for a place (names expire, so they are never stored). */
export async function fetchPlacePhotos(placeId: string): Promise<MapsPhotoRef[]> {
  if (!isPlaceId(placeId)) return [];
  return parsePlacePhotos(await placesGet(`/places/v1/places/${placeId}`, "photos"));
}

/**
 * Adds the listing's photos to a demo's media library, credited by name.
 * Non-fatal: with no photos (or Maps down) the AI pictures fill every slot.
 */
export async function attachMapsPhotos(
  db: SupabaseClient,
  organizationId: string,
  businessName: string,
  placeId: string,
): Promise<number> {
  try {
    const photos = await fetchPlacePhotos(placeId);
    if (!photos.length) return 0;
    const rows = photos.map((photo, index) => ({
      organization_id: organizationId,
      url: mapsPhotoPath(organizationId, index),
      file_name: `google-maps-${index + 1}.jpg`,
      category: index === 0 ? "hero" : "work",
      alt_text: mapsPhotoLabel(businessName, photo.author),
      source: "google_maps",
      license: "google_maps_live",
      attribution: photo.author ? `${photo.author} on Google Maps` : "Google Maps",
    }));
    const { error } = await db.from("media").insert(rows as never);
    if (error) {
      console.warn("[maps-photos] media rows skipped", error.message);
      return 0;
    }
    return rows.length;
  } catch (error) {
    console.warn("[maps-photos] lookup skipped", error instanceof Error ? error.message : error);
    return 0;
  }
}

// Fresh photo addresses last about an hour; reuse one briefly to limit Maps calls.
const uriCache = new Map<string, { uri: string; until: number }>();
const CACHE_MS = 30 * 60_000;

/** GET /api/public/maps-photo/:org/:index — redirects to Google's live photo. */
export async function handleMapsPhotoRequest(db: SupabaseClient, orgParam: string, indexParam: string): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404 });
  const parsed = parseMapsPhotoPath(orgParam, indexParam);
  if (!parsed) return notFound();
  const key = `${parsed.organizationId}:${parsed.index}`;
  const cached = uriCache.get(key);
  if (cached && cached.until > Date.now()) return redirect(cached.uri);

  // Only workspaces that were created from a Maps listing have a place ID.
  const { data } = await db.from("website_settings").select("generation").eq("organization_id", parsed.organizationId).maybeSingle();
  const placeId = (data as { generation?: { prospectDemo?: { placeId?: unknown } } } | null)?.generation?.prospectDemo?.placeId;
  if (!isPlaceId(placeId)) return notFound();
  try {
    const photos = await fetchPlacePhotos(placeId);
    const photo = photos[parsed.index];
    if (!photo || parsed.index >= MAX_MAPS_PHOTOS) return notFound();
    const media = (await placesGet(`/places/v1/${photo.name}/media?maxWidthPx=1600&skipHttpRedirect=true`)) as { photoUri?: unknown };
    if (typeof media.photoUri !== "string" || !/^https:\/\//.test(media.photoUri)) return notFound();
    uriCache.set(key, { uri: media.photoUri, until: Date.now() + CACHE_MS });
    return redirect(media.photoUri);
  } catch (error) {
    console.warn("[maps-photos] live photo failed", error instanceof Error ? error.message : error);
    return new Response("Photo unavailable", { status: 502 });
  }
}

function redirect(uri: string): Response {
  return new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "public, max-age=1800" } });
}
