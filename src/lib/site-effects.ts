/**
 * Visual effects the Website Assistant (and the builder UI) can install on a
 * client's website: animated backdrops for the whole site and 3D / motion
 * treatments for individual sections.
 *
 * Two kinds of effect exist:
 *  - AI-AUTHORED (primary): backgrounds the AI composes itself as numbers and
 *    hex colours (BackdropSpec below), and per-section motion/interaction the
 *    AI writes on its compositions. No menu; only safety bounds.
 *  - NAMED IDS (compatibility + owner controls): the small id catalogs below
 *    are renderer-safe drawings kept so saved sites render unchanged and the
 *    owner's Effect Studio has buttons. They never decide a look for the AI.
 * No raw CSS, HTML or scripts are ever accepted or stored.
 *
 * Storage (no schema changes needed):
 *  - site backdrop → `website_settings.generation.effects.backdrop`
 *  - section effect → `website_sections.settings.effect`
 */

export type BackdropId =
  "none" | "stars" | "aurora" | "nebula" | "grid" | "spotlight" | "gradient_mesh";

export type SectionEffectId =
  "none" | "float_3d" | "tilt_3d" | "glass" | "gold_glow" | "rise" | "parallax_slow" | "shine";

export type EffectOption<T extends string> = {
  id: T;
  label: string;
  /** One line a business owner understands. */
  help: string;
};

export const BACKDROPS: EffectOption<BackdropId>[] = [
  { id: "none", label: "Clean", help: "No background animation. Fastest and most neutral." },
  {
    id: "stars",
    label: "Starfield",
    help: "Slow drifting stars behind the whole site. Premium and calm.",
  },
  { id: "aurora", label: "Aurora", help: "Soft moving gold light bands, like northern lights." },
  { id: "nebula", label: "Nebula glow", help: "Deep drifting colour clouds for a high-end feel." },
  {
    id: "grid",
    label: "Tech grid",
    help: "Faint moving grid lines. Great for trades and installers.",
  },
  {
    id: "spotlight",
    label: "Spotlight",
    help: "A wide light beam that follows the top of the page.",
  },
  {
    id: "gradient_mesh",
    label: "Gradient mesh",
    help: "Blended colour wash that shifts very slowly.",
  },
];

export const SECTION_EFFECTS: EffectOption<SectionEffectId>[] = [
  { id: "none", label: "Standard", help: "No extra motion." },
  { id: "float_3d", label: "3D float", help: "The section gently floats in 3D space." },
  { id: "tilt_3d", label: "3D tilt", help: "The section sits on a slight 3D angle with depth." },
  { id: "glass", label: "Frosted glass", help: "Translucent glass panel over the backdrop." },
  { id: "gold_glow", label: "Gold glow", help: "A gold halo that draws the eye to this block." },
  { id: "rise", label: "Rise in", help: "Fades and rises into view as visitors scroll." },
  { id: "parallax_slow", label: "Parallax", help: "Moves slower than the page for depth." },
  { id: "shine", label: "Gold shine", help: "A slow gold sheen sweeps across the block." },
];

const BACKDROP_IDS = new Set(BACKDROPS.map((b) => b.id));
const SECTION_IDS = new Set(SECTION_EFFECTS.map((s) => s.id));

export const isBackdropId = (value: unknown): value is BackdropId =>
  typeof value === "string" && BACKDROP_IDS.has(value as BackdropId);

export const isSectionEffectId = (value: unknown): value is SectionEffectId =>
  typeof value === "string" && SECTION_IDS.has(value as SectionEffectId);

export const backdropLabel = (id: BackdropId) =>
  BACKDROPS.find((b) => b.id === id)?.label ?? "Clean";
export const sectionEffectLabel = (id: SectionEffectId) =>
  SECTION_EFFECTS.find((s) => s.id === id)?.label ?? "Standard";

/** Reads the site backdrop out of `website_settings.generation`. */
export function readBackdrop(generation: unknown): BackdropId {
  const effects = (generation as { effects?: unknown } | null)?.effects;
  const id = (effects as { backdrop?: unknown } | null)?.backdrop;
  return isBackdropId(id) ? id : "none";
}

/** Merges a backdrop choice into an existing `generation` JSON blob. */
export function writeBackdrop(generation: unknown, backdrop: BackdropId) {
  const base = (generation && typeof generation === "object" ? generation : {}) as Record<
    string,
    unknown
  >;
  const effects = (
    base["effects"] && typeof base["effects"] === "object" ? base["effects"] : {}
  ) as Record<string, unknown>;
  return { ...base, effects: { ...effects, backdrop } };
}

/** Reads the per-section effect out of `website_sections.settings`. */
export function readSectionEffect(settings: unknown): SectionEffectId {
  const id = (settings as { effect?: unknown } | null)?.effect;
  return isSectionEffectId(id) ? id : "none";
}

/** Merges a section effect into an existing `settings` JSON blob. */
export function writeSectionEffect(settings: unknown, effect: SectionEffectId) {
  const base = (settings && typeof settings === "object" ? settings : {}) as Record<
    string,
    unknown
  >;
  return { ...base, effect };
}

/** Class name for the wrapper around a section. */
export const sectionEffectClass = (effect: SectionEffectId) =>
  effect === "none" ? "" : `fx-sec fx-sec-${effect.replace(/_/g, "-")}`;

/* ----------------------- AI-authored backdrop spec ------------------------ */

/**
 * A site background the AI writes itself, as plain numbers and hex colours.
 * There is no menu: any gradient composition inside these safe bounds renders.
 * Only numbers and #RRGGBB colours are stored, so nothing can inject CSS.
 */
export type BackdropLayerSpec = {
  shape: "radial" | "linear" | "conic";
  colors: string[];
  angle: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
};
export type BackdropSpec = { layers: BackdropLayerSpec[]; drift: "none" | "slow" | "medium" };

const SPEC_HEX = /^#[0-9a-fA-F]{6}$/;
const bound = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function safeBackdropSpec(value: unknown): BackdropSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const layers: BackdropLayerSpec[] = [];
  for (const entry of Array.isArray(raw["layers"]) ? raw["layers"].slice(0, 8) : []) {
    if (!entry || typeof entry !== "object") continue;
    const l = entry as Record<string, unknown>;
    const colors = (Array.isArray(l["colors"]) ? l["colors"] : [])
      .filter((c): c is string => typeof c === "string" && SPEC_HEX.test(c))
      .slice(0, 6);
    if (colors.length < 1) continue;
    layers.push({
      shape: l["shape"] === "linear" || l["shape"] === "conic" ? l["shape"] : "radial",
      colors,
      angle: bound(l["angle"], 0, 360, 135),
      x: bound(l["x"], 0, 100, 50),
      y: bound(l["y"], 0, 100, 0),
      size: bound(l["size"], 1, 400, 80),
      // Opacity stays capped so a background can never drown out page text.
      opacity: bound(l["opacity"], 0, 80, 30),
    });
  }
  if (!layers.length) return null;
  const drift = raw["drift"] === "slow" || raw["drift"] === "medium" ? raw["drift"] : "none";
  return { layers, drift };
}

export function readBackdropSpec(generation: unknown): BackdropSpec | null {
  const effects = (generation as { effects?: unknown } | null)?.effects;
  return safeBackdropSpec((effects as { spec?: unknown } | null)?.spec);
}

/** Stores (or clears) the authored spec beside the legacy backdrop id. */
export function writeBackdropSpec(generation: unknown, spec: BackdropSpec | null) {
  const base = (generation && typeof generation === "object" ? generation : {}) as Record<string, unknown>;
  const effects = (
    base["effects"] && typeof base["effects"] === "object" ? base["effects"] : {}
  ) as Record<string, unknown>;
  const next = { ...effects };
  if (spec) next["spec"] = spec;
  else delete next["spec"];
  return { ...base, effects: next };
}

/** CSS for one authored layer. Values are already bounded numbers and hex colours. */
export function backdropLayerCss(layer: BackdropLayerSpec): string {
  const stops = layer.colors.length === 1 ? [layer.colors[0], "transparent"] : layer.colors;
  if (layer.shape === "conic")
    return `conic-gradient(from ${layer.angle}deg at ${layer.x}% ${layer.y}%, ${stops.join(", ")})`;
  return layer.shape === "linear"
    ? `linear-gradient(${layer.angle}deg, ${stops.join(", ")})`
    : `radial-gradient(${layer.size}% ${layer.size}% at ${layer.x}% ${layer.y}%, ${stops.join(", ")})`;
}
