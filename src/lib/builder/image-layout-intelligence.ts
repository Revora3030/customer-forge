/**
 * IMAGE → LAYOUT INTELLIGENCE
 * ===========================
 *
 * Sections are composed around the image that actually exists, not around a
 * generic slot. Given measurable signals for a picture — focal point, subject
 * position, brightness, contrast, dominant colours, negative space — this module
 * decides where text sits, how strong the overlay must be, how the image is
 * cropped, what geometry the surrounding card takes and what happens on mobile.
 *
 * Pure and deterministic: no network, no database, no business claims.
 */

import type { CreativeBrief, ImageBriefSpec } from "@/lib/builder/creative-brief";

export type ImageSample = { r: number; g: number; b: number; x: number; y: number };

export type ImageSignals = {
  /** 0-1 across the frame. */
  focalX: number;
  focalY: number;
  /** Mean luminance, 0-1. */
  brightness: number;
  /** Spread of luminance, 0-1. */
  contrast: number;
  dominantColors: string[];
  orientation: "landscape" | "portrait" | "square";
  /** Side of the frame with the calmest pixels — safest place for type. */
  safeTextArea: "left" | "right" | "top" | "bottom";
  negativeSpaceRatio: number;
  /** How busy the frame is, 0-1. Busy frames need stronger overlays. */
  visualDensity: number;
  cropSafe: boolean;
};

function luminance(s: ImageSample) {
  return (0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b) / 255;
}

function hex(r: number, g: number, b: number) {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Derive signals from a sparse grid of RGB samples (x/y normalised 0-1).
 * A handful of samples is enough to place type safely.
 */
export function imageSignalsFromSamples(samples: ImageSample[], aspect: number): ImageSignals {
  if (samples.length === 0) {
    return {
      focalX: 0.5,
      focalY: 0.5,
      brightness: 0.5,
      contrast: 0.3,
      dominantColors: [],
      orientation: aspect > 1.05 ? "landscape" : aspect < 0.95 ? "portrait" : "square",
      safeTextArea: "left",
      negativeSpaceRatio: 0.4,
      visualDensity: 0.5,
      cropSafe: true,
    };
  }

  const lums = samples.map(luminance);
  const brightness = lums.reduce((sum, l) => sum + l, 0) / lums.length;
  const min = Math.min(...lums);
  const max = Math.max(...lums);
  const contrast = max - min;

  // Local contrast per half tells us which side is calm enough to carry type.
  const sideEnergy = (filter: (s: ImageSample) => boolean) => {
    const group = samples.filter(filter);
    if (group.length === 0) return 1;
    const values = group.map(luminance);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.abs(v - mean), 0) / values.length;
  };
  const left = sideEnergy((s) => s.x < 0.45);
  const right = sideEnergy((s) => s.x > 0.55);
  const top = sideEnergy((s) => s.y < 0.45);
  const bottom = sideEnergy((s) => s.y > 0.55);
  const sides: [ImageSignals["safeTextArea"], number][] = [
    ["left", left],
    ["right", right],
    ["top", top],
    ["bottom", bottom],
  ];
  sides.sort((a, b) => a[1] - b[1]);
  const safeTextArea = sides[0]![0];

  // The busiest region is treated as the subject / focal point.
  let focal = samples[0]!;
  let bestDelta = -1;
  for (const sample of samples) {
    const delta = Math.abs(luminance(sample) - brightness);
    if (delta > bestDelta) {
      bestDelta = delta;
      focal = sample;
    }
  }

  const energy = samples.reduce((sum, s) => sum + Math.abs(luminance(s) - brightness), 0) / samples.length;
  const visualDensity = Math.max(0, Math.min(1, energy * 3));
  const negativeSpaceRatio = Math.max(0, Math.min(1, 1 - visualDensity));

  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (const s of samples) {
    const key = `${Math.round(s.r / 48)}-${Math.round(s.g / 48)}-${Math.round(s.b / 48)}`;
    const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    entry.r += s.r;
    entry.g += s.g;
    entry.b += s.b;
    entry.n += 1;
    buckets.set(key, entry);
  }
  const dominantColors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((entry) => hex(entry.r / entry.n, entry.g / entry.n, entry.b / entry.n));

  return {
    focalX: focal.x,
    focalY: focal.y,
    brightness,
    contrast,
    dominantColors,
    orientation: aspect > 1.05 ? "landscape" : aspect < 0.95 ? "portrait" : "square",
    safeTextArea,
    negativeSpaceRatio,
    visualDensity,
    cropSafe: focal.x > 0.12 && focal.x < 0.88 && focal.y > 0.1 && focal.y < 0.9,
  };
}

/** Fallback when no pixels are available: use the brief's intended composition. */
export function imageSignalsFromBrief(brief: ImageBriefSpec): ImageSignals {
  const focalX = brief.focalPoint === "left" ? 0.3 : brief.focalPoint === "right" ? 0.7 : 0.5;
  const focalY = brief.focalPoint === "lower-third" ? 0.7 : 0.5;
  const [w, h] = brief.aspectRatio.split(":").map(Number);
  const aspect = (w ?? 16) / (h ?? 9);
  return {
    focalX,
    focalY,
    brightness: 0.45,
    contrast: 0.35,
    dominantColors: [],
    orientation: aspect > 1.05 ? "landscape" : aspect < 0.95 ? "portrait" : "square",
    safeTextArea: brief.negativeSpace,
    negativeSpaceRatio: 0.45,
    visualDensity: 0.5,
    cropSafe: true,
  };
}

export type LayoutAdaptation = {
  textPlacement: "left" | "right" | "centre" | "below";
  textAlign: "start" | "center";
  /** 0-1 scrim strength required for readable text over the image. */
  overlayStrength: number;
  overlayStyle: "none" | "linear-scrim" | "full-scrim" | "panel";
  /** CSS object-position that keeps the subject in frame. */
  objectPosition: string;
  mobileObjectPosition: string;
  mobileStack: "text-first" | "image-first";
  cardGeometry: "flush" | "inset-panel" | "floating-card";
  imageRatioDesktop: string;
  imageRatioMobile: string;
  /** True when type must move off the image entirely. */
  moveTextOffImage: boolean;
  notes: string[];
};

export function adaptSectionLayout(
  signals: ImageSignals,
  brief: Pick<CreativeBrief, "density" | "heroComposition" | "shapeLanguage"> | null,
  options?: { slot?: string },
): LayoutAdaptation {
  const notes: string[] = [];
  const busy = signals.visualDensity > 0.65 || signals.negativeSpaceRatio < 0.25;
  const bright = signals.brightness > 0.62;
  const lowContrastForType = signals.contrast > 0.55;

  let textPlacement: LayoutAdaptation["textPlacement"];
  if (signals.safeTextArea === "left") textPlacement = "left";
  else if (signals.safeTextArea === "right") textPlacement = "right";
  else if (signals.safeTextArea === "top") textPlacement = "centre";
  else textPlacement = "centre";

  const moveTextOffImage = busy && (bright || lowContrastForType) && !signals.cropSafe;
  if (moveTextOffImage) {
    textPlacement = "below";
    notes.push("Frame is busy and unevenly lit, so headline copy sits below the image instead of over it.");
  }

  let overlayStrength = 0;
  if (textPlacement !== "below") {
    overlayStrength = Math.min(0.72, Math.max(0.18, (bright ? 0.45 : 0.28) + signals.visualDensity * 0.3));
  }
  const overlayStyle: LayoutAdaptation["overlayStyle"] =
    textPlacement === "below"
      ? "none"
      : busy
        ? "panel"
        : overlayStrength > 0.5
          ? "full-scrim"
          : "linear-scrim";
  if (overlayStyle === "panel") {
    notes.push("Text sits on a tinted panel so contrast holds over the busiest part of the picture.");
  }

  const posX = Math.round(Math.max(12, Math.min(88, signals.focalX * 100)));
  const posY = Math.round(Math.max(15, Math.min(85, signals.focalY * 100)));

  const cardGeometry: LayoutAdaptation["cardGeometry"] =
    brief?.shapeLanguage.shadow === "none"
      ? busy
        ? "inset-panel"
        : "flush"
      : busy
        ? "floating-card"
        : "inset-panel";

  const isHero = (options?.slot ?? "hero") === "hero";
  const imageRatioDesktop = isHero
    ? signals.orientation === "portrait"
      ? "4 / 5"
      : "16 / 9"
    : signals.orientation === "square"
      ? "1 / 1"
      : "3 / 2";

  return {
    textPlacement,
    textAlign: textPlacement === "centre" ? "center" : "start",
    overlayStrength: Number(overlayStrength.toFixed(2)),
    overlayStyle,
    objectPosition: `${posX}% ${posY}%`,
    mobileObjectPosition: `${posX}% ${Math.min(70, posY)}%`,
    mobileStack: signals.cropSafe && !busy ? "image-first" : "text-first",
    cardGeometry,
    imageRatioDesktop,
    imageRatioMobile: signals.cropSafe ? "4 / 5" : "3 / 2",
    moveTextOffImage,
    notes,
  };
}

/** Reasons a picture should not be used as-is in the slot it was made for. */
export function imageLayoutWarnings(signals: ImageSignals, slot: string): string[] {
  const warnings: string[] = [];
  if (!signals.cropSafe) warnings.push(`${slot}: subject sits near the frame edge and will crop badly on mobile`);
  if (signals.contrast < 0.08) warnings.push(`${slot}: picture is almost flat, so it will read as an empty block`);
  if (signals.brightness > 0.92) warnings.push(`${slot}: picture is blown out and cannot carry text`);
  if (signals.brightness < 0.06) warnings.push(`${slot}: picture is almost black and loses its subject`);
  if (signals.negativeSpaceRatio < 0.12) warnings.push(`${slot}: no calm area for a headline`);
  return warnings;
}
