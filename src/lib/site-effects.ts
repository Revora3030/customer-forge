/**
 * Visual effects the Website Assistant (and the builder UI) can install on a
 * client's website: animated backdrops for the whole site and 3D / motion
 * treatments for individual sections.
 *
 * Effects are an ALLOWLIST. Clients and the AI only ever choose an id from the
 * catalogs below — no raw CSS, HTML or scripts are ever accepted or stored, so
 * a creative request can never turn into an injection.
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
