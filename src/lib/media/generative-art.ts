/**
 * GENERATIVE DECORATIVE ARTWORK
 * =============================
 *
 * Zero-cost, zero-provider artwork. This produces a *data-only* description of
 * abstract shapes (blobs, arcs, rings, waves, bars, dot fields) which a trusted
 * React component draws as an SVG. There is no image provider, no credit cost,
 * no network call, and no generated code that runs in a visitor's browser.
 *
 * Honesty rules baked in:
 * - The artwork is abstract. It never depicts, implies, or claims anything about
 *   the business (no fake storefronts, no fake teams, no fake results).
 * - Alt text says it is decorative; decorative artwork is marked aria-hidden so
 *   screen readers skip it rather than hearing an invented description.
 * - It is deterministic: the same site always gets the same artwork, so a
 *   rebuild does not silently change the look.
 */

export type ArtLayerKind = "blob" | "ring" | "arc" | "wave" | "bar" | "dots" | "rays" | "tile";

export type ArtLayer = {
  kind: ArtLayerKind;
  /** 0-100 canvas coordinates, so the SVG scales to any frame. */
  x: number;
  y: number;
  size: number;
  rotate: number;
  opacity: number;
  /** "primary" | "accent" | "secondary" — resolved to real colours at render. */
  tone: "primary" | "accent" | "secondary";
  /** Stroke-only layers (rings, arcs, waves, rays). */
  stroke?: number;
  /** Repeat count for dot fields / bar sets / tiles. */
  repeat?: number;
};

export type ArtworkSpec = {
  /** Which decorative system produced it — mirrors the design fingerprint. */
  system: string;
  seed: number;
  /** Background wash beneath the layers. */
  wash: "none" | "linear" | "radial" | "dual" | "mesh";
  layers: ArtLayer[];
  /** Always true: this artwork carries no information. */
  decorative: true;
  /** What a screen reader would be told if it were ever exposed. */
  altText: string;
};

const MAX_LAYERS = 7;

const WASH_BY_SYSTEM: Record<string, ArtworkSpec["wash"]> = {
  "soft-blobs": "mesh",
  "arc-set": "linear",
  "ring-set": "radial",
  "dot-grid": "none",
  "line-rays": "radial",
  "wave-band": "linear",
  "corner-shapes": "dual",
  "floating-tiles": "linear",
  "contour-drift": "radial",
  "prism-shards": "dual",
  "grid-fade": "none",
  halo: "radial",
  "stacked-bars": "linear",
  orbit: "radial",
  none: "none",
};

const LAYERS_BY_SYSTEM: Record<string, ArtLayerKind[]> = {
  "soft-blobs": ["blob", "blob", "blob"],
  "arc-set": ["arc", "arc", "arc"],
  "ring-set": ["ring", "ring", "ring"],
  "dot-grid": ["dots"],
  "line-rays": ["rays", "ring"],
  "wave-band": ["wave", "wave"],
  "corner-shapes": ["blob", "tile"],
  "floating-tiles": ["tile", "tile", "tile"],
  "contour-drift": ["wave", "wave", "wave"],
  "prism-shards": ["tile", "arc"],
  "grid-fade": ["dots", "bar"],
  halo: ["ring", "blob"],
  "stacked-bars": ["bar", "bar", "bar"],
  orbit: ["ring", "arc", "blob"],
  none: [],
};

function rng(seed: number) {
  let state = (seed || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * Builds the artwork for one site. `system` comes from the design fingerprint's
 * decorative system, so artwork varies per customer without extra input.
 */
export function generateArtwork(system: string, seed: number): ArtworkSpec {
  const kinds = LAYERS_BY_SYSTEM[system] ?? LAYERS_BY_SYSTEM["soft-blobs"] ?? [];
  const next = rng(seed);
  const tones: ArtLayer["tone"][] = ["primary", "accent", "secondary"];

  const layers: ArtLayer[] = kinds.slice(0, MAX_LAYERS).map((kind, index) => {
    const stroke = kind === "ring" || kind === "arc" || kind === "wave" || kind === "rays"
      ? Math.round(1 + next() * 3)
      : undefined;
    const repeat = kind === "dots" ? 40 + Math.round(next() * 40)
      : kind === "bar" || kind === "tile" ? 3 + Math.round(next() * 4)
      : undefined;
    return {
      kind,
      x: Math.round(next() * 100),
      y: Math.round(next() * 100),
      size: Math.round(18 + next() * 62),
      rotate: Math.round(next() * 360),
      opacity: Number((0.06 + next() * 0.22).toFixed(3)),
      tone: tones[(index + seed) % tones.length] as ArtLayer["tone"],
      ...(stroke ? { stroke } : {}),
      ...(repeat ? { repeat } : {}),
    };
  });

  return {
    system: LAYERS_BY_SYSTEM[system] ? system : "soft-blobs",
    seed,
    wash: WASH_BY_SYSTEM[system] ?? "linear",
    layers,
    decorative: true,
    altText: "Decorative abstract artwork. It does not depict the business.",
  };
}

/** Whether this artwork would render anything at all. */
export function artworkIsEmpty(spec: ArtworkSpec): boolean {
  return spec.wash === "none" && spec.layers.length === 0;
}
