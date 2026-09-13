/**
 * REVORA DESIGN DECISION ENGINE — one coordinated direction, never random tweaks.
 *
 * A mood word like "premium" or "industrial" is turned into a set of decisions
 * that agree with each other: palette, typeface, background, motion, density
 * and which sections carry the eye. The trade's own playbook is the starting
 * point, so a roofer asking for "modern" and a dentist asking for "modern" do
 * not end up with the same site.
 *
 * Deterministic, dependency-free and free to run.
 */

import type { BackdropId, SectionEffectId } from "@/lib/site-effects";
import { resolveBackdrop, resolveColor, resolveFont } from "@/lib/visual-palette";
import type { IndustryPlaybook } from "./industry";
import type { StyleMood } from "./interpreter";

export type DesignDecision = {
  theme: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    font_preference: string;
  };
  backdrop: BackdropId;
  /** Motion for the hero, chosen to match the mood, not sprinkled at random. */
  heroEffect: SectionEffectId;
  /** Motion for the supporting blocks. */
  bodyEffect: SectionEffectId;
  /** How tall and airy sections should sit. */
  density: "full" | "standard" | "compact";
  /** Plain-English record of the direction, shown to the owner. */
  rationale: string[];
};

type MoodRule = {
  theme?: Partial<DesignDecision["theme"]>;
  backdrop?: BackdropId;
  heroEffect?: SectionEffectId;
  bodyEffect?: SectionEffectId;
  density?: DesignDecision["density"];
  says: string;
};

/**
 * Each mood is a whole direction. Later moods layer over earlier ones, so
 * "premium but bright" lands somewhere sensible rather than fighting itself.
 */
const MOOD_RULES: Record<StyleMood, MoodRule> = {
  premium: {
    theme: { secondary_color: "#0b0b12", accent_color: "#d4af37", font_preference: "serif" },
    backdrop: "nebula",
    heroEffect: "gold_glow",
    bodyEffect: "rise",
    density: "full",
    says: "Restrained deep background, gold accent and a serif headline — expensive without shouting.",
  },
  professional: {
    theme: { font_preference: "sans" },
    backdrop: "none",
    heroEffect: "rise",
    bodyEffect: "none",
    density: "standard",
    says: "Clean background and a plain typeface so the words carry the credibility.",
  },
  minimal: {
    theme: { font_preference: "sans" },
    backdrop: "none",
    heroEffect: "none",
    bodyEffect: "none",
    density: "compact",
    says: "Nothing decorative — space and hierarchy do the work.",
  },
  bold: {
    theme: { accent_color: "#f97316" },
    backdrop: "gradient_mesh",
    heroEffect: "rise",
    bodyEffect: "rise",
    density: "full",
    says: "Bigger hero, warm accent and stronger buttons so the next step is unmissable.",
  },
  friendly: {
    theme: { font_preference: "sans", accent_color: "#22c55e" },
    backdrop: "aurora",
    heroEffect: "rise",
    bodyEffect: "none",
    density: "standard",
    says: "Softer light and rounder wording so it reads approachable.",
  },
  modern: {
    theme: { font_preference: "sans" },
    backdrop: "grid",
    heroEffect: "tilt_3d",
    bodyEffect: "rise",
    density: "standard",
    says: "Faint grid and light depth — current without being a trend.",
  },
  dark: {
    theme: { secondary_color: "#08080d" },
    backdrop: "stars",
    heroEffect: "glass",
    bodyEffect: "rise",
    density: "standard",
    says: "Dark surface with glass panels so photos and buttons pull focus.",
  },
  bright: {
    theme: { secondary_color: "#f8fafc" },
    backdrop: "spotlight",
    heroEffect: "rise",
    bodyEffect: "none",
    density: "standard",
    says: "Light, open surface with a soft spotlight on the top of the page.",
  },
};

/** Small, stable hash of a string — same input always gives the same number. */
function seedFrom(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Rotates a hex color's hue by a fixed number of degrees; keeps saturation and lightness. */
function rotateHue(hex: string, degrees: number): string {
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + degrees + 360) % 360, s, l);
}

/** -18..+18 degrees, stable per business — enough to feel distinct, not enough to break the brand. */
function businessHueOffset(seedKey: string): number {
  return (seedFrom(seedKey) % 37) - 18;
}

/**
 * Builds one coordinated direction from the trade playbook plus any mood words
 * the owner used. With no mood words at all, the trade's own direction is used.
 *
 * `seedKey` — pass something stable and unique to the business (name + city +
 * state) to nudge the palette's hue a fixed, deterministic amount. Without it,
 * every business in the same trade asking for the same mood gets the exact
 * same hex codes — the industry default is a single fixed point, not a range.
 * The nudge is bounded (±18°) so it stays recognizably "this trade," it just
 * stops being pixel-identical to every other client's site.
 */
export function designDecision(
  playbook: IndustryPlaybook,
  moods: StyleMood[],
  seedKey?: string,
): DesignDecision {
  const decision: DesignDecision = {
    theme: {
      primary_color: resolveColor(playbook.visual.primary),
      secondary_color: resolveColor(playbook.visual.secondary),
      accent_color: resolveColor(playbook.visual.accent),
      font_preference: resolveFont(playbook.visual.font),
    },
    backdrop: resolveBackdrop(playbook.visual.backdrop),
    heroEffect: "rise",
    bodyEffect: "none",
    density: "standard",
    rationale: [`Started from the direction that suits ${playbook.label.toLowerCase()}.`],
  };

  for (const mood of moods) {
    const rule = MOOD_RULES[mood];
    if (!rule) continue;
    Object.assign(decision.theme, rule.theme ?? {});
    if (rule.backdrop) decision.backdrop = rule.backdrop;
    if (rule.heroEffect) decision.heroEffect = rule.heroEffect;
    if (rule.bodyEffect) decision.bodyEffect = rule.bodyEffect;
    if (rule.density) decision.density = rule.density;
    decision.rationale.push(rule.says);
  }

  if (seedKey) {
    const offset = businessHueOffset(seedKey);
    decision.theme.primary_color = rotateHue(decision.theme.primary_color, offset);
    decision.theme.accent_color = rotateHue(decision.theme.accent_color, offset);
    decision.rationale.push(
      `Nudged the palette (${offset >= 0 ? "+" : ""}${offset}°) so this doesn't land on the exact same colors as every other ${playbook.label.toLowerCase()} site.`,
    );
  }

  return decision;
}

/**
 * The order sections should sit in when the owner asks for the important things
 * to be easier to find. Only kinds already on the page are returned, so nothing
 * is invented and nothing is lost.
 */
export const HIERARCHY_ORDER = [
  "hero",
  "trust_bar",
  "offer",
  "intro",
  "services",
  "benefits",
  "pricing",
  "process",
  "gallery",
  "reviews",
  "guarantee",
  "area",
  "faq",
  "lead_magnet",
  "quote",
  "booking",
  "cta",
  "contact",
  "sticky_cta",
];

/** Sorts the page's own sections into buyer-decision order. */
export function hierarchySort<T extends { id: string; kind: string }>(sections: T[]): T[] {
  const rank = (kind: string) => {
    const index = HIERARCHY_ORDER.indexOf(kind);
    return index === -1 ? HIERARCHY_ORDER.length : index;
  };
  return [...sections].sort((left, right) => rank(left.kind) - rank(right.kind));
}
