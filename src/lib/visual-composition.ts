/**
 * Revora Infinite Creative Engine — visual compositions (pure layer).
 *
 * The old effects catalog answered "which of my 7 backdrops do you want?".
 * This module answers a different question: "what visual experience should
 * THIS website have?" — and builds it out of primitives.
 *
 * A composition is a stack of tunable visual layers (stars, light rays, fog,
 * liquid motion, textures, holographic sheen…), each with its own density,
 * speed, scale, colour, motion, parallax and interaction. Any plain-language
 * request is interpreted into that stack, so requests we have never seen
 * before ("make it feel underwater", "a moving galaxy behind the hero",
 * "premium magazine") still produce a real, buildable result instead of
 * "that isn't available".
 *
 * Safety and performance are part of the type, not an afterthought:
 *  - layer kinds, motions, palettes and interactions are allowlisted enums,
 *    every number is clamped — no raw CSS, HTML or scripts are ever stored,
 *  - a performance budget caps layer count and heavy layers,
 *  - each layer declares its own mobile behaviour, and all motion is dropped
 *    for visitors who prefer reduced motion (handled in CSS).
 *
 * Storage (no schema change): `website_settings.generation.effects.composition`.
 */

export type LayerKind =
  | "stars"
  | "constellation"
  | "meteors"
  | "particles"
  | "orbs"
  | "rays"
  | "spotlight"
  | "aurora"
  | "nebula"
  | "mesh"
  | "grid"
  | "blueprint"
  | "streaks"
  | "waves"
  | "liquid"
  | "fog"
  | "rain"
  | "snow"
  | "holo"
  | "metal"
  | "texture"
  | "pattern"
  | "vignette";

export type LayerMotion = "still" | "drift" | "sweep" | "pulse" | "fall" | "rise" | "orbit";
export type LayerPalette = "brand" | "accent" | "cool" | "warm" | "mono" | "deep";
export type LayerInteraction = "none" | "cursor" | "scroll" | "both";
export type LayerMobile = "keep" | "simplify" | "off";

export type VisualLayer = {
  kind: LayerKind;
  /** 0–100. How much of it there is. */
  density: number;
  /** 0–100. How fast it moves. */
  speed: number;
  /** 0–100. How large each element reads. */
  scale: number;
  /** 0–100. Strength on the page. */
  opacity: number;
  palette: LayerPalette;
  motion: LayerMotion;
  /** 0–100. How much depth separation it gets. */
  parallax: number;
  interaction: LayerInteraction;
  mobile: LayerMobile;
};

export type VisualComposition = {
  /** Stable id so the same concept can be recognised and rolled back. */
  id: string;
  name: string;
  /** One line the business owner understands. */
  summary: string;
  layers: VisualLayer[];
  /** 0–100 global strength; scales every layer at render time. */
  intensity: number;
  /** Where the request came from — useful for the originality score. */
  origin: "prompt" | "command" | "auto" | "manual";
};

export const LAYER_LIBRARY: { kind: LayerKind; label: string; help: string; cost: number }[] = [
  { kind: "stars", label: "Starfield", help: "Drifting stars with depth.", cost: 1 },
  {
    kind: "constellation",
    label: "Constellations",
    help: "Linked star points, quiet and technical.",
    cost: 1,
  },
  {
    kind: "meteors",
    label: "Meteor trails",
    help: "Occasional light streaks falling across the page.",
    cost: 2,
  },
  {
    kind: "particles",
    label: "Floating particles",
    help: "Fine motes suspended in the air.",
    cost: 2,
  },
  {
    kind: "orbs",
    label: "Glowing orbs",
    help: "Soft spheres of light behind the content.",
    cost: 2,
  },
  { kind: "rays", label: "Light rays", help: "Directional beams, cinematic and premium.", cost: 1 },
  {
    kind: "spotlight",
    label: "Spotlight",
    help: "One wide beam that lifts the top of the page.",
    cost: 1,
  },
  { kind: "aurora", label: "Aurora", help: "Slow bands of coloured light.", cost: 2 },
  { kind: "nebula", label: "Nebula", help: "Deep drifting colour clouds.", cost: 2 },
  {
    kind: "mesh",
    label: "Mesh gradient",
    help: "Blended colour wash that shifts very slowly.",
    cost: 1,
  },
  { kind: "grid", label: "Tech grid", help: "Faint engineered grid lines.", cost: 1 },
  {
    kind: "blueprint",
    label: "Blueprint",
    help: "Technical drawing lines — trades and engineering.",
    cost: 1,
  },
  { kind: "streaks", label: "Light streaks", help: "Fast horizontal light trails.", cost: 2 },
  { kind: "waves", label: "Energy waves", help: "Rolling wave bands, calm and organic.", cost: 2 },
  { kind: "liquid", label: "Liquid motion", help: "Slow water-like movement.", cost: 2 },
  { kind: "fog", label: "Fog / smoke", help: "Atmospheric haze for depth.", cost: 2 },
  { kind: "rain", label: "Rain", help: "Fine falling lines.", cost: 2 },
  { kind: "snow", label: "Snow", help: "Soft falling flecks.", cost: 2 },
  { kind: "holo", label: "Holographic sheen", help: "Iridescent shift across the page.", cost: 2 },
  { kind: "metal", label: "Metallic / chrome", help: "Brushed metal light sweep.", cost: 1 },
  { kind: "texture", label: "Texture", help: "Paper, concrete, marble or fabric grain.", cost: 1 },
  {
    kind: "pattern",
    label: "Editorial pattern",
    help: "Repeating geometry for magazine energy.",
    cost: 1,
  },
  { kind: "vignette", label: "Vignette", help: "Darkened edges that focus the centre.", cost: 1 },
];

const LAYER_KINDS = new Set(LAYER_LIBRARY.map((entry) => entry.kind));
const MOTIONS: LayerMotion[] = ["still", "drift", "sweep", "pulse", "fall", "rise", "orbit"];
const PALETTES: LayerPalette[] = ["brand", "accent", "cool", "warm", "mono", "deep"];
const INTERACTIONS: LayerInteraction[] = ["none", "cursor", "scroll", "both"];
const MOBILES: LayerMobile[] = ["keep", "simplify", "off"];

export const layerLabel = (kind: LayerKind) =>
  LAYER_LIBRARY.find((entry) => entry.kind === kind)?.label ?? kind;

/* ------------------------------ performance ------------------------------ */

/** Layers beyond this never render; the engine trims the weakest first. */
export const MAX_LAYERS = 4;
/** Total render cost allowed on one page. Keeps phones smooth. */
export const MAX_COST = 6;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
};

const layerCost = (layer: VisualLayer) => {
  const base = LAYER_LIBRARY.find((entry) => entry.kind === layer.kind)?.cost ?? 1;
  return base + (layer.density > 70 ? 1 : 0);
};

/** Validates, clamps and performance-trims anything claiming to be a layer stack. */
export function safeLayers(value: unknown): VisualLayer[] {
  if (!Array.isArray(value)) return [];
  const layers: VisualLayer[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const kind = entry["kind"];
    if (typeof kind !== "string" || !LAYER_KINDS.has(kind as LayerKind)) continue;
    if (layers.some((existing) => existing.kind === kind)) continue;

    layers.push({
      kind: kind as LayerKind,
      density: clamp(entry["density"], 0, 100, 50),
      speed: clamp(entry["speed"], 0, 100, 40),
      scale: clamp(entry["scale"], 0, 100, 50),
      opacity: clamp(entry["opacity"], 0, 100, 55),
      palette: PALETTES.includes(entry["palette"] as LayerPalette)
        ? (entry["palette"] as LayerPalette)
        : "brand",
      motion: MOTIONS.includes(entry["motion"] as LayerMotion)
        ? (entry["motion"] as LayerMotion)
        : "drift",
      parallax: clamp(entry["parallax"], 0, 100, 30),
      interaction: INTERACTIONS.includes(entry["interaction"] as LayerInteraction)
        ? (entry["interaction"] as LayerInteraction)
        : "none",
      mobile: MOBILES.includes(entry["mobile"] as LayerMobile)
        ? (entry["mobile"] as LayerMobile)
        : "simplify",
    });
  }

  const trimmed: VisualLayer[] = [];
  let cost = 0;
  for (const layer of layers.slice(0, MAX_LAYERS)) {
    const next = cost + layerCost(layer);
    if (next > MAX_COST) continue;
    cost = next;
    trimmed.push(layer);
  }
  return trimmed;
}

export function safeComposition(value: unknown): VisualComposition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const layers = safeLayers(entry["layers"]);
  if (!layers.length) return null;
  const origin = entry["origin"];
  return {
    id: typeof entry["id"] === "string" ? entry["id"].slice(0, 60) : `comp-${layers.map((l) => l.kind).join("-").slice(0, 50)}`,
    name: typeof entry["name"] === "string" ? entry["name"].slice(0, 60) : "Custom visual",
    summary:
      typeof entry["summary"] === "string"
        ? entry["summary"].slice(0, 240)
        : layers.map((l) => l.kind).join(" + "),
    layers,
    intensity: clamp(entry["intensity"], 10, 100, 65),
    origin:
      origin === "prompt" || origin === "command" || origin === "auto" || origin === "manual"
        ? origin
        : "manual",
  };
}

/** Reads the composition out of `website_settings.generation`. */
export function readComposition(generation: unknown): VisualComposition | null {
  const effects = (generation as { effects?: unknown } | null)?.effects;
  return safeComposition((effects as { composition?: unknown } | null)?.composition);
}

/** Merges a composition (or `null` to clear it) into a `generation` blob. */
export function writeComposition(generation: unknown, composition: VisualComposition | null) {
  const base = (generation && typeof generation === "object" ? generation : {}) as Record<
    string,
    unknown
  >;
  const effects = (
    base["effects"] && typeof base["effects"] === "object" ? base["effects"] : {}
  ) as Record<string, unknown>;
  const next = { ...effects };
  if (composition) next["composition"] = composition;
  else delete next["composition"];
  return { ...base, effects: next };
}
