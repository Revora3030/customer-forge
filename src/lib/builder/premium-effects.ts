/**
 * Premium effects: animated shader backgrounds, word split-in and scroll-depth
 * motion, the labelled scroll meter, the 360° tour and the 3D floor explorer.
 *
 * Pure rules only (no DOM, no React): which effects suit a business, how many
 * heavy effects a page may carry, what each falls back to, and the site-wide
 * owner switch. The renderer and the AI prompt both read from here so the
 * choice and the fallback can never disagree.
 *
 * Licences: Paper Shaders (Apache-2.0), Photo Sphere Viewer (MIT), three.js /
 * React Three Fiber / drei (MIT). Motion is CSS plus the MIT `motion`
 * package already in the app; GSAP is deliberately not used (its standard
 * licence is not MIT/Apache/CC0 and excludes no-code visual animation
 * builders that compete with Webflow, which a site builder can be). Lenis is
 * not used either: native scroll keeps scroll-snap pages and the section
 * settle working and never slows an emergency visitor down.
 *
 * Performance rules (REVORA premium effects spec, 2026-10-30): nothing in the
 * first load, one live WebGL canvas per page, 3D and 360 only after a tap,
 * and a still CSS poster for every fallback.
 */
import { contrastRatio } from "@/lib/readable-color";

/** Shader looks, all from Paper Shaders (Apache-2.0); none needs an image or a third-party asset. */
export const SHADER_KINDS = ["mesh", "grain", "warp", "swirl", "god-rays", "neuro-noise"] as const;
export type ShaderKind = (typeof SHADER_KINDS)[number];
export const isShaderKind = (value: unknown): value is ShaderKind => SHADER_KINDS.includes(value as ShaderKind);

/** Motions this module adds on top of the CSS presets. */
export const PREMIUM_MOTIONS = ["split", "depth"] as const;
export type PremiumMotion = (typeof PREMIUM_MOTIONS)[number];

/**
 * Blocks that download a WebGL library or pin the page. A page carries at most
 * {@link MAX_HEAVY_PER_PAGE} of them so it stays fast on a phone.
 */
export const HEAVY_PRIMITIVES: ReadonlySet<string> = new Set(["shader_field", "model_3d_viewer", "tour_360", "building_explorer"]);
export const MAX_HEAVY_PER_PAGE = 2;
/** One background shader per page: it is the page's one always-on canvas. */
export const MAX_SHADERS_PER_PAGE = 1;

/** Bounds for the floor explorer and the tour. Rendering safety, not taste. */
export const BUILDING_LIMITS = { minFloors: 2, maxFloors: 12, label: 40, body: 160 } as const;
export const TOUR_LIMITS = { minScenes: 1, maxScenes: 8, label: 30 } as const;
export const METER_LABEL_MAX = 18;

export type BuildingFloor = { label: string; body?: string };

/* -------------------------------------------------------------------------- */
/* Fallbacks                                                                  */
/* -------------------------------------------------------------------------- */

/** What the visitor's browser allows. Unknown (server render) is the still look. */
export type FxEnvironment = { webgl: boolean; reducedMotion: boolean; saveData?: boolean };

/**
 * Effect tiers by trade. T0: CSS and motion only, no WebGL at all. T1: one
 * slow shader. T2: animated shader plus scroll and text effects. T3: T2 plus
 * a tap-to-open 3D or 360° block.
 */
export const FX_TIERS = [0, 1, 2, 3] as const;
export type FxTier = (typeof FX_TIERS)[number];
export const isFxTier = (value: unknown): value is FxTier => FX_TIERS.includes(value as FxTier);

/** Server render and the first client paint: everything still. */
export const STILL_ENVIRONMENT: FxEnvironment = { webgl: false, reducedMotion: true };

/**
 * A shader animates only with WebGL, motion allowed, no data saver and a
 * trade tier above T0 (T0 trades are CSS only); otherwise its still gradient shows.
 */
export function shaderMode(env: FxEnvironment, siteOn = true, tier: FxTier = 2): "live" | "still" {
  return siteOn && tier > 0 && env.webgl && !env.reducedMotion && !env.saveData ? "live" : "still";
}

/** Shader speed by tier: T1 drifts slowly, T2 and up moves. Zero is a frozen frame. */
export function shaderSpeed(tier: FxTier, playing: boolean): number {
  if (!playing || tier === 0) return 0;
  return tier === 1 ? 0.12 : 0.3;
}

/** Device pixel ratio cap: 1.5 on phones, 2 on larger screens. */
export function dprCap(viewportWidth: number): number {
  return viewportWidth < 768 ? 1.5 : 2;
}

/** Pixel budget for a background shader: 720p on phones, 1080p elsewhere. */
export function shaderPixelBudget(viewportWidth: number): number {
  return viewportWidth < 768 ? 1280 * 720 : 1920 * 1080;
}

/**
 * One live WebGL canvas per page. A background shader holds the slot only
 * while it is near the screen and gives it up to any viewer the visitor
 * opens; the newest viewer the visitor opened wins, and a background never
 * displaces a viewer.
 */
export type CanvasClaim = { id: string; kind: "background" | "viewer" };
export function createCanvasBudget(onChange?: (holder: CanvasClaim | null) => void) {
  let holder: CanvasClaim | null = null;
  const listeners = new Set<(holder: CanvasClaim | null) => void>();
  const emit = () => { onChange?.(holder); listeners.forEach((fn) => fn(holder)); };
  return {
    /** True when the claim now holds the slot. */
    acquire(claim: CanvasClaim): boolean {
      if (holder?.id === claim.id) return true;
      // A background never displaces anything; a viewer the visitor just opened displaces whatever is live.
      if (holder && claim.kind === "background") return false;
      holder = claim;
      emit();
      return true;
    },
    release(id: string) {
      if (holder?.id !== id) return;
      holder = null;
      emit();
    },
    holder: () => holder,
    subscribe(fn: (holder: CanvasClaim | null) => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
export type CanvasBudget = ReturnType<typeof createCanvasBudget>;

/** The tour needs WebGL; without it the first panorama shows as a flat picture with the scene list. */
export function tourMode(env: FxEnvironment, siteOn = true): "interactive" | "poster" {
  return siteOn && env.webgl ? "interactive" : "poster";
}

/** The floor explorer needs WebGL; without it the floors are an ordinary accessible list. */
export function buildingMode(env: FxEnvironment, siteOn = true): "scene" | "list" {
  return siteOn && env.webgl && !env.saveData ? "scene" : "list";
}

/** Split and depth motions run only when motion is allowed and the owner left effects on. */
export function premiumMotionMode(env: Pick<FxEnvironment, "reducedMotion">, siteOn = true): "animate" | "still" {
  return siteOn && !env.reducedMotion ? "animate" : "still";
}

/* -------------------------------------------------------------------------- */
/* Colours                                                                    */
/* -------------------------------------------------------------------------- */

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;
const DARK_BASE = "#0a0d10";
const DEFAULT_ACCENT = "#3b82f6";

function hex6(value: string | undefined | null): string | null {
  if (!value) return null;
  if (HEX6.test(value)) return value.toLowerCase();
  const short = HEX3.exec(value);
  return short ? `#${[...short[1]!].map((c) => c + c).join("")}`.toLowerCase() : null;
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Four shader colours from one base and one accent, dark-first: the base
 * (default the obsidian studio canvas), a deep tint, the accent and a soft
 * highlight. Only the site's own palette is used.
 */
export function shaderPalette(base: string | undefined | null, accent: string | undefined | null): [string, string, string, string] {
  const b = hex6(base) ?? DARK_BASE;
  const a = hex6(accent) ?? DEFAULT_ACCENT;
  return [b, mix(b, a, 0.35), a, mix(b, a, 0.7)];
}

/** The still look of a shader: the same palette as layered CSS gradients. */
export function shaderStillCss(palette: readonly string[], kind: ShaderKind = "mesh"): string {
  const [b, deep, accent, soft] = palette;
  if (kind === "god-rays")
    return `radial-gradient(60% 80% at 50% -10%, ${soft}66 0%, transparent 65%), conic-gradient(from 160deg at 50% -10%, transparent 0deg, ${accent}26 12deg, transparent 24deg, ${accent}1f 36deg, transparent 48deg), linear-gradient(180deg, ${deep} 0%, ${b} 70%)`;
  if (kind === "grain" || kind === "swirl")
    return `radial-gradient(120% 90% at 20% 110%, ${accent}66 0%, transparent 60%), radial-gradient(90% 70% at 90% -10%, ${soft}55 0%, transparent 55%), linear-gradient(160deg, ${b} 0%, ${deep} 100%)`;
  return `radial-gradient(80% 80% at 15% 20%, ${accent}59 0%, transparent 60%), radial-gradient(70% 70% at 85% 30%, ${soft}4d 0%, transparent 60%), radial-gradient(90% 90% at 50% 100%, ${deep} 0%, transparent 70%), ${b}`;
}

/**
 * Lowest contrast of a text colour against every colour the shader can show.
 * Text on a shader must pass on all of them because the colours move.
 */
export function shaderTextContrast(text: string, palette: readonly string[]): number | null {
  let worst: number | null = null;
  for (const colour of palette) {
    const ratio = contrastRatio(text, colour);
    if (ratio === null) return null;
    worst = worst === null ? ratio : Math.min(worst, ratio);
  }
  return worst;
}

/* -------------------------------------------------------------------------- */
/* Owner data                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A 360° panorama the owner supplied: their own photo (never stock or AI-made)
 * that is filed as a panorama/360 shot or has the 2:1 equirectangular shape.
 */
export function isPanoramaPart(settings: unknown): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
  const record = settings as Record<string, unknown>;
  const visual = (record["visual"] ?? {}) as Record<string, unknown>;
  if (visual["source"] !== "customer") return false;
  const category = String(record["media_category"] ?? "").toLowerCase();
  if (/panoram|360|sphere/.test(category)) return true;
  const width = Number(visual["width"]);
  const height = Number(visual["height"]);
  return Number.isFinite(width) && Number.isFinite(height) && height > 0 && width >= 2000 && Math.abs(width / height - 2) <= 0.05;
}

/**
 * Render-time guard for a tour scene: a picture whose known size is clearly
 * not 2:1 is an ordinary photo and would look stretched in the sphere. A
 * picture with no recorded size is allowed (the validator checked it).
 */
export function looksEquirect(visual: unknown): boolean {
  if (!visual || typeof visual !== "object") return true;
  const record = visual as Record<string, unknown>;
  const width = Number(record["width"]);
  const height = Number(record["height"]);
  if (!(width > 0) || !(height > 0)) return true;
  return Math.abs(width / height - 2) <= 0.1;
}

/** Site-wide owner switch and meter label, stored in website_settings.generation.effects.premium (no migration). */
export type PremiumSiteSettings = { enabled: boolean; meterLabel: string | null };

const METER_LABEL = /^[\p{L}\p{N} '&-]{1,18}$/u;

export function cleanMeterLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= METER_LABEL_MAX && METER_LABEL.test(text) ? text.toLowerCase() : null;
}

function effectsOf(generation: unknown): Record<string, unknown> {
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) return {};
  const effects = (generation as Record<string, unknown>)["effects"];
  return effects && typeof effects === "object" && !Array.isArray(effects) ? (effects as Record<string, unknown>) : {};
}

/** The owner's site-wide premium settings. Effects default to on; the meter label defaults to none. */
export function readPremiumSettings(generation: unknown): PremiumSiteSettings & { meterSet: boolean } {
  const raw = effectsOf(generation)["premium"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { enabled: true, meterLabel: null, meterSet: false };
  const record = raw as Record<string, unknown>;
  const meterSet = "meterLabel" in record;
  return { enabled: record["enabled"] !== false, meterLabel: cleanMeterLabel(record["meterLabel"]), meterSet };
}

export function writePremiumSettings(generation: unknown, patch: { enabled?: boolean; meterLabel?: string | null }): Record<string, unknown> {
  const base = generation && typeof generation === "object" && !Array.isArray(generation) ? { ...(generation as Record<string, unknown>) } : {};
  const effects = { ...effectsOf(generation) };
  const current = readPremiumSettings(generation);
  const next: Record<string, unknown> = { enabled: patch.enabled ?? current.enabled };
  if (patch.meterLabel !== undefined) next["meterLabel"] = cleanMeterLabel(patch.meterLabel);
  else if (current.meterSet) next["meterLabel"] = current.meterLabel;
  effects["premium"] = next;
  base["effects"] = effects;
  return base;
}

/* -------------------------------------------------------------------------- */
/* Budget                                                                     */
/* -------------------------------------------------------------------------- */

type TreeLike = { type: string; children?: TreeLike[]; tabs?: { children: TreeLike[] }[] };

/** Every heavy block in a tree, with its path. */
export function heavyNodes(root: TreeLike, path = "root"): { type: string; path: string }[] {
  const out: { type: string; path: string }[] = [];
  const visit = (node: TreeLike, at: string) => {
    if (HEAVY_PRIMITIVES.has(node.type)) out.push({ type: node.type, path: at });
    node.children?.forEach((child, i) => visit(child, `${at}.children[${i}]`));
    node.tabs?.forEach((tab, t) => tab.children.forEach((child, i) => visit(child, `${at}.tabs[${t}].children[${i}]`)));
  };
  visit(root, path);
  return out;
}

/**
 * Heavy blocks beyond the per-page budget, in page order: the first
 * {@link MAX_HEAVY_PER_PAGE} stay, the rest are reported.
 */
export function overBudget(sections: { id: string; root: TreeLike }[]): { sectionId: string; type: string; path: string }[] {
  const all = sections.flatMap((section) => heavyNodes(section.root).map((hit) => ({ sectionId: section.id, ...hit })));
  const over: typeof all = [];
  let kept = 0;
  let shaders = 0;
  for (const hit of all) {
    const shader = hit.type === "shader_field";
    if (kept >= MAX_HEAVY_PER_PAGE || (shader && shaders >= MAX_SHADERS_PER_PAGE)) { over.push(hit); continue; }
    kept += 1;
    if (shader) shaders += 1;
  }
  return over;
}

/** Splits a heading into words for the split-in motion, keeping the spaces. */
export function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/** Validated floors for the explorer, or a problem. Labels and notes are owner facts. */
export function checkFloors(value: unknown): { floors: BuildingFloor[] } | { problem: string } {
  if (!Array.isArray(value)) return { problem: "floors must be a list of {label, body}" };
  if (value.length < BUILDING_LIMITS.minFloors || value.length > BUILDING_LIMITS.maxFloors)
    return { problem: `building_explorer needs ${BUILDING_LIMITS.minFloors}-${BUILDING_LIMITS.maxFloors} floors` };
  const floors: BuildingFloor[] = [];
  for (const [i, raw] of value.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { problem: `floor ${i} must be an object` };
    const row = raw as Record<string, unknown>;
    const label = typeof row["label"] === "string" ? row["label"].trim() : "";
    const body = typeof row["body"] === "string" ? row["body"].trim() : "";
    if (!label || label.length > BUILDING_LIMITS.label) return { problem: `floor ${i} label needs 1-${BUILDING_LIMITS.label} characters` };
    if (body.length > BUILDING_LIMITS.body) return { problem: `floor ${i} body must be ${BUILDING_LIMITS.body} characters or fewer` };
    floors.push(body ? { label, body } : { label });
  }
  return { floors };
}
