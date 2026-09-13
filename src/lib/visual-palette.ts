/**
 * Canonical named visual tokens → concrete CSS values.
 *
 * Industry playbooks describe a direction in words a human understands
 * (`primary: "deep blue"`, `backdrop: "soft"`). Every consumer that actually
 * renders or validates needs concrete values: hex colors, a real CSS font
 * family and an allowlisted backdrop id. Resolving them here, in one place,
 * guarantees the deterministic planner's decisions survive validation, get
 * persisted, and visibly render — instead of being saved but ignored.
 */

import type { BackdropId } from "@/lib/site-effects";

export type ColorToken =
  | "black"
  | "blush"
  | "bright neutral"
  | "charcoal"
  | "cool blue"
  | "deep blue"
  | "forest"
  | "graphite"
  | "navy"
  | "neutral"
  | "slate"
  | "soft teal"
  | "teal"
  | "warm earth"
  | "warm neutral"
  | "warm white"
  | "clean neutral"
  | "cool gray"
  | "cream surface"
  | "earth"
  | "light neutral"
  | "soft surface"
  | "surface";

export const COLOR_TOKENS: Record<ColorToken, string> = {
  black: "#101014",
  blush: "#e8c3c3",
  "bright neutral": "#f4f4f0",
  charcoal: "#2b2b33",
  "cool blue": "#2563eb",
  "deep blue": "#1d3f73",
  forest: "#315c3a",
  graphite: "#3d4048",
  navy: "#16233f",
  neutral: "#6b7280",
  slate: "#4b5563",
  "soft teal": "#5fa8a0",
  teal: "#2e8b83",
  "warm earth": "#7a4e2d",
  "warm neutral": "#8a8177",
  "warm white": "#f5f1ea",
  "clean neutral": "#e9e9e6",
  "cool gray": "#84898f",
  "cream surface": "#f4ecd7",
  earth: "#6b5136",
  "light neutral": "#f0efec",
  "soft surface": "#efeaf0",
  surface: "#edece8",
};

export type AccentToken =
  | "appetite accent"
  | "brand"
  | "brand accent"
  | "calm accent"
  | "comfort accent"
  | "electric accent"
  | "energy accent"
  | "fresh accent"
  | "gold accent"
  | "high contrast"
  | "high visibility"
  | "natural accent";

export const ACCENT_TOKENS: Record<AccentToken, string> = {
  "appetite accent": "#c2442e",
  brand: "#c9a227",
  "brand accent": "#b4922f",
  "calm accent": "#3f9b8f",
  "comfort accent": "#b08a5a",
  "electric accent": "#f6b32c",
  "energy accent": "#ef8f2e",
  "fresh accent": "#4c9e3f",
  "gold accent": "#c9a227",
  "high contrast": "#ffffff",
  "high visibility": "#e4572e",
  "natural accent": "#479c54",
};

export type FontToken =
  | "display sans"
  | "display serif"
  | "elegant sans"
  | "modern sans";

export const FONT_TOKENS: Record<FontToken, string> = {
  "display sans": "Bricolage Grotesque",
  "display serif": "Playfair Display",
  "elegant sans": "Cormorant Garamond",
  "modern sans": "Space Grotesk",
};

/**
 * Resolve a named colour token to a valid hex colour.
 *
 * Accepts hex as-is (mood rules and design directions already use hex), and
 * rejects anything else so a bad value can never reach the renderer. Falls
 * back to a neutral grey so a missing token doesn't silently produce invalid
 * CSS either.
 */
export function resolveColor(token: string | null | undefined): string {
  if (typeof token === "string") {
    const trimmed = token.trim();
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
      return trimmed;
    }
    const named = COLOR_TOKENS[trimmed as ColorToken];
    if (named) return named;
    const accent = ACCENT_TOKENS[trimmed as AccentToken];
    if (accent) return accent;
  }
  return "#6b7280";
}

export function isColorToken(value: string): value is ColorToken | AccentToken {
  return value in COLOR_TOKENS || value in ACCENT_TOKENS;
}

export function resolveFont(token: string | null | undefined): string {
  if (typeof token === "string") {
    const trimmed = token.trim();
    const known = FONT_TOKENS[trimmed as FontToken];
    if (known) return known;
    if (trimmed) return trimmed;
  }
  return "Space Grotesk";
}

const SOFT_BACKDROP: BackdropId = "none";
const DARK_BACKDROP: BackdropId = "stars";

/**
 * Resolve an industry playbook backdrop word to an allowlisted `BackdropId`.
 *
 * `"soft"` means "no animation" and `"dark"` means "dark starfield" — both
 * were historically descriptive strings, not ids, so the action validator
 * rejected them. Resolve them here so a whole-site plan's backdrop choice is
 * actually rendered.
 */
export function resolveBackdrop(token: string | null | undefined): BackdropId {
  if (token === "soft") return SOFT_BACKDROP;
  if (token === "dark") return DARK_BACKDROP;
  const value = typeof token === "string" ? token : "";
  if (
    value === "none" ||
    value === "stars" ||
    value === "aurora" ||
    value === "nebula" ||
    value === "grid" ||
    value === "spotlight" ||
    value === "gradient_mesh"
  ) {
    return value as BackdropId;
  }
  return SOFT_BACKDROP;
}