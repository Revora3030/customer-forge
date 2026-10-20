import { describe, expect, it } from "vitest";
import { MAX_MAPS_PHOTOS, mapsPhotoLabel, parseMapsPhotoPath, parsePlacePhotos } from "./maps-photos";

describe("Google Maps demo photos", () => {
  it("credits every photo to the person who took it", () => {
    const refs = parsePlacePhotos({ photos: [{ name: "places/abc123/photos/p1", authorAttributions: [{ displayName: "Dana R" }] }] });
    expect(refs).toEqual([{ name: "places/abc123/photos/p1", author: "Dana R" }]);
    expect(mapsPhotoLabel("Shined Up", "Dana R")).toBe("Shined Up, photo by Dana R on Google Maps");
  });
  it("uses at most 8 photos and drops malformed ones", () => {
    const photos = Array.from({ length: 12 }, (_, i) => ({ name: `places/x/photos/p${i}` }));
    expect(parsePlacePhotos({ photos: [{ name: "https://evil" }, ...photos] })).toHaveLength(MAX_MAPS_PHOTOS);
  });
  it("rejects photo paths outside a workspace's range", () => {
    expect(parseMapsPhotoPath("not-an-id", "0")).toBeNull();
    expect(parseMapsPhotoPath("123e4567-e89b-12d3-a456-426614174000", "8")).toBeNull();
    expect(parseMapsPhotoPath("123e4567-e89b-12d3-a456-426614174000", "2")?.index).toBe(2);
  });
});
