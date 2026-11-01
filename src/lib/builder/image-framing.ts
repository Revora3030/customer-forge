/**
 * Picture framing rules for generated customer sites: which photos are good
 * enough for a slot, where the crop should be centred, and which widths a
 * browser can pick from. Pure and dependency-free so it runs on the server, in
 * the browser and in tests.
 */

export type PhotoSlot = "hero" | "gallery" | "card";

/** How much of the scene a picture shows. A `detail` shot is a close-up only. */
export type PhotoFraming = "wide" | "medium" | "detail";

/** Brightness and contrast numbers, all on a 0..1 scale, measured offline. */
export type PhotoStats = {
  /** Width divided by height of the original picture. */
  aspect: number;
  /** Mean luminance. */
  mean: number;
  /** Standard deviation of luminance. */
  contrast: number;
  /** Share of pixels that are near-black. */
  darkShare: number;
};

export type PhotoGrade = { ok: true } | { ok: false; reason: string };

/** Pictures darker or flatter than this look muddy once text sits on them. */
export const MIN_MEAN_BRIGHTNESS = 0.3;
export const MAX_MEAN_BRIGHTNESS = 0.88;
export const MIN_CONTRAST = 0.12;
export const MAX_DARK_SHARE = 0.25;
/** The hero crops to a wide band, so it needs a clearly landscape source. */
export const MIN_HERO_ASPECT = 1.3;

/** Rejects dark, washed-out and low-contrast pictures from measured numbers. */
export function gradePhotoStats(stats: PhotoStats): PhotoGrade {
  const values = [stats.aspect, stats.mean, stats.contrast, stats.darkShare];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return { ok: false, reason: "no usable measurements" };
  }
  if (stats.mean < MIN_MEAN_BRIGHTNESS) return { ok: false, reason: "too dark" };
  if (stats.darkShare > MAX_DARK_SHARE) return { ok: false, reason: "too much of the frame is near-black" };
  if (stats.mean > MAX_MEAN_BRIGHTNESS) return { ok: false, reason: "washed out" };
  if (stats.contrast < MIN_CONTRAST) return { ok: false, reason: "too flat" };
  return { ok: true };
}

/**
 * Whether a picture suits a slot. Dark, flat and washed-out pictures never
 * qualify. Close-up-only shots are kept for cards and galleries but never lead
 * a page, and the hero also needs a landscape picture.
 */
export function gradePhotoForSlot(
  photo: PhotoStats & { framing: PhotoFraming },
  slot: PhotoSlot,
): PhotoGrade {
  const exposure = gradePhotoStats(photo);
  if (!exposure.ok) return exposure;
  if (slot === "hero") {
    if (photo.framing === "detail") return { ok: false, reason: "close-up only" };
    if (photo.aspect < MIN_HERO_ASPECT) return { ok: false, reason: "not wide enough for a hero" };
  }
  return { ok: true };
}

/** A focal point as percentages from the left and top of the picture. */
export type FocalPoint = { x: number; y: number };

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** CSS `object-position` for a focal point, so the subject stays in the crop. */
export function focalToObjectPosition(focal: FocalPoint): string {
  return `${clampPercent(focal.x)}% ${clampPercent(focal.y)}%`;
}

/** Aspect ratio each slot is cropped to (width / height). */
export const SLOT_ASPECT: Record<PhotoSlot, number> = {
  hero: 16 / 9,
  gallery: 4 / 3,
  card: 3 / 2,
};

export type ResponsiveImage = { src: string; srcSet?: string; sizes?: string };

const PEXELS_HOST = "images.pexels.com";
const UNSPLASH_HOST = "images.unsplash.com";
export const RESPONSIVE_WIDTHS = [480, 800, 1200, 1600] as const;

function parseHttps(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

/** The Pexels photo id inside a Pexels CDN address, or null. */
export function pexelsPhotoId(url: string): string | null {
  const parsed = parseHttps(url);
  if (!parsed || parsed.hostname !== PEXELS_HOST) return null;
  return /^\/photos\/(\d+)\//.exec(parsed.pathname)?.[1] ?? null;
}

/**
 * `srcset`/`sizes` for pictures whose host resizes by a `w` parameter (Pexels
 * and Unsplash). Any other address is returned untouched, because we cannot
 * know it supports resizing.
 */
export function responsiveImage(url: string, sizes: string): ResponsiveImage {
  const parsed = parseHttps(url);
  if (!parsed || (parsed.hostname !== PEXELS_HOST && parsed.hostname !== UNSPLASH_HOST)) return { src: url };
  const variant = (width: number) => {
    const next = new URL(parsed.toString());
    next.searchParams.set("w", String(width));
    // A fixed height would distort the crop at other widths.
    next.searchParams.delete("h");
    next.searchParams.delete("fit");
    return `${next.toString()} ${width}w`;
  };
  return { src: url, srcSet: RESPONSIVE_WIDTHS.map(variant).join(", "), sizes };
}
