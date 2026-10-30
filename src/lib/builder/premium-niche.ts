/**
 * Which premium effects suit a business (by its trade playbook or archetype),
 * as prompt guidance for the AI and defaults for the public page. Kept apart
 * from premium-effects.ts so the validator does not pull in the playbooks.
 */
import { playbookFor, archetypeFor } from "@/lib/builder/industry-playbook";
import { HEAVY_PRIMITIVES, MAX_HEAVY_PER_PAGE, type FxTier, type ShaderKind, type PremiumSiteSettings } from "@/lib/builder/premium-effects";

/** What suits one kind of business. Ideas for the AI, never orders. */
export type NicheEffects = {
  key: string;
  /** Effect tier (T0 CSS only … T3 tap-to-open 3D/360), from the premium effects spec trade map. */
  tier: FxTier;
  /** Shader look for text-led heroes and closing bands, or null when photos should lead. */
  shader: ShaderKind | null;
  /** Word split-in on display headings. */
  split: boolean;
  /** Scroll-linked depth on full-bleed pictures. */
  depth: boolean;
  /** Owner panoramas suit a 360° tour. */
  tour360: boolean;
  /** Owner floor facts suit the 3D floor explorer. */
  building: boolean;
  /** Word after the percentage in the sticky scroll meter, e.g. "41% clean". Null shows the plain bar only. */
  meterLabel: string | null;
};

const BASE: Omit<NicheEffects, "key"> = { tier: 1, shader: "mesh", split: true, depth: true, tour360: false, building: false, meterLabel: null };

/**
 * Per trade or archetype key, from the spec's trade map. Anything not listed
 * gets BASE. A T0 trade never gets a live shader; a tour or explorer is still
 * fine wherever the owner supplied the real material, because it only loads
 * after a tap.
 */
const NICHE: Record<string, Partial<Omit<NicheEffects, "key">>> = {
  plumbing: { tier: 0, shader: null, split: false, depth: false },
  pest: { tier: 0, shader: null, split: false, depth: false },
  locksmith: { tier: 0, shader: null, split: false, depth: false },
  towing: { tier: 0, shader: null, split: false, depth: false },
  "garage-door": { tier: 0, shader: null, split: false, depth: false },
  "appliance-repair": { tier: 0, shader: null, split: false, depth: false },
  "emergency-dispatch": { tier: 0, shader: null, split: false, depth: false },
  hvac: { tier: 1, shader: "grain", split: false },
  electrical: { tier: 1, shader: "neuro-noise" },
  cleaning: { tier: 1, shader: "mesh", meterLabel: "clean" },
  "home-services": { tier: 1, shader: "mesh" },
  dentist: { tier: 1, shader: "grain", tour360: true },
  "law-firms": { tier: 1, shader: "mesh", depth: false },
  "clinical-trust": { tier: 1, shader: "mesh" },
  restaurants: { tier: 1, shader: "grain", tour360: true, depth: false },
  "hospitality-lifestyle": { tier: 1, shader: "grain", tour360: true },
  roofing: { tier: 2, shader: "grain", building: false },
  landscaping: { tier: 2, shader: "grain", tour360: true },
  "pressure-washing": { tier: 2, shader: "swirl", meterLabel: "clean" },
  "exterior-cleaning": { tier: 2, shader: "swirl", meterLabel: "clean" },
  painting: { tier: 2, shader: "swirl", tour360: true },
  "med-spa": { tier: 2, shader: "mesh", tour360: true },
  "auto-detailing": { tier: 2, shader: "warp", meterLabel: "detailed", tour360: true },
  "gyms-fitness": { tier: 2, shader: "warp", tour360: true },
  "salons-barbers": { tier: 2, shader: "warp", tour360: true },
  "precision-craft": { tier: 2, shader: "grain" },
  "tech-growth": { tier: 2, shader: "mesh" },
  "photo-creative": { tier: 2, shader: "grain" },
  "real-estate": { tier: 3, shader: "god-rays", tour360: true, building: true },
};

/** The premium effects that suit a business, by its trade playbook or archetype. */
export function nicheEffects(industry: string | null | undefined, hints: string | null | undefined = null): NicheEffects {
  const playbook = playbookFor(industry);
  const archetype = archetypeFor(industry, hints);
  const key = playbook?.key ?? archetype?.key ?? "general";
  const own = NICHE[key] ?? (archetype ? NICHE[archetype.key] : undefined) ?? {};
  return { key, ...BASE, ...own };
}

/** One prompt paragraph telling the AI which premium effects fit this business and the budget. */
export function premiumEffectsNote(industry: string | null | undefined, hints: string | null | undefined = null): string {
  const fx = nicheEffects(industry, hints);
  const fits: string[] = [];
  if (fx.tier === 0) fits.push("tier T0: no WebGL at all — CSS gradients and the plain reveals only, so the phone number and booking come first");
  if (fx.shader) fits.push(`a shader_field (shader "${fx.shader}") behind a text-led hero or closing band that has no supplied picture`);
  if (fx.split) fits.push('motion.kind "split" on the opening level-1 heading');
  if (fx.depth) fits.push('motion.kind "depth" on one full-bleed picture or scene backdrop');
  if (fx.tour360) fits.push("a tour_360 when the owner supplied 360° panoramas (parts marked panorama360)");
  if (fx.building) fits.push("a building_explorer when the owner supplied real floor-by-floor facts");
  return [
    `PREMIUM EFFECTS for this business (${fx.key}, tier T${fx.tier}): ${fits.length ? fits.join("; ") : "keep motion light; speed and the call button come first"}.`,
    `Heavy blocks (${[...HEAVY_PRIMITIVES].join(", ")}) download extra code: at most ${MAX_HEAVY_PER_PAGE} per page and at most one shader_field, and never at the cost of the real pictures.`,
    "Only one live 3D or shader canvas runs at a time; a tour_360, building_explorer or model_3d_viewer opens on a tap.",
    "Every effect has a still fallback (no WebGL, reduced motion, data saver), so the copy must read on the fallback too.",
  ].join(" ");
}

/**
 * The meter label a page shows: the owner's own choice when they set one
 * (an empty choice hides it), else the niche default, else none. Nothing when
 * the owner switched premium effects off.
 */
export function resolveMeterLabel(site: PremiumSiteSettings & { meterSet?: boolean }, niche: NicheEffects): string | null {
  if (!site.enabled) return null;
  if (site.meterSet) return site.meterLabel;
  return niche.meterLabel;
}

