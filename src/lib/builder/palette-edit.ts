/**
 * Palette choices for the builder preview's inline editor.
 *
 * Pure helpers (no React, no network) shared by the editor panel, the server
 * save and the tests. A palette is the same three colours the site already
 * stores on `business_profiles` (`primary_color`, `secondary_color`,
 * `accent_color`) and that `siteThemeStyle` turns into CSS variables, so a
 * preset never invents a new theme mechanism; it only chooses those colours.
 *
 * Contrast is judged on the colours the page will really paint: the page
 * surface after `premiumSurface`, and the label colour `siteThemeStyle` picks
 * for a button. Warnings are advice, never a block: the owner decides.
 */

import { contrastRatio } from "@/lib/readable-color";
import { isLight, premiumSurface } from "@/lib/site-theme";

export type Palette = {
  primary: string;
  secondary: string;
  accent: string;
};

export type PalettePreset = Palette & { id: string; name: string };

/** WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text and UI shapes. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

/**
 * A handful of ready-made looks. None is Revora's own black-and-gold, since a
 * customer site must never inherit the house identity.
 */
export const PALETTE_PRESETS: readonly PalettePreset[] = [
  { id: "ocean", name: "Ocean", primary: "#1d4ed8", secondary: "#f8fafc", accent: "#0369a1" },
  { id: "forest", name: "Forest", primary: "#166534", secondary: "#f6faf4", accent: "#a16207" },
  { id: "ember", name: "Ember", primary: "#b91c1c", secondary: "#fffaf5", accent: "#c2410c" },
  { id: "plum", name: "Plum", primary: "#7e22ce", secondary: "#faf7fd", accent: "#be185d" },
  { id: "slate", name: "Slate", primary: "#334155", secondary: "#f8fafc", accent: "#0f766e" },
  { id: "midnight", name: "Midnight", primary: "#60a5fa", secondary: "#0b1220", accent: "#34d399" },
];

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** "#ABC" or "#aabbcc" (a leading "#" is optional) to "#aabbcc", else null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (!raw.startsWith("#")) raw = `#${raw}`;
  if (HEX3.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return HEX6.test(raw) ? raw : null;
}

/** All three colours valid, or null. */
export function readPalette(input: { primary?: unknown; secondary?: unknown; accent?: unknown } | null | undefined): Palette | null {
  const primary = normalizeHex(input?.primary);
  const secondary = normalizeHex(input?.secondary);
  const accent = normalizeHex(input?.accent);
  return primary && secondary && accent ? { primary, secondary, accent } : null;
}

export function samePalette(a: Palette | null | undefined, b: Palette | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.primary === b.primary && a.secondary === b.secondary && a.accent === b.accent;
}

/** The preset a palette exactly matches, if any (for the "selected" state). */
export function matchingPreset(palette: Palette | null | undefined): PalettePreset | null {
  return PALETTE_PRESETS.find((preset) => samePalette(preset, palette)) ?? null;
}

export type ContrastWarning = {
  id: "button-text" | "button-shape" | "accent-shape";
  message: string;
  ratio: number;
  required: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * AA problems this palette would cause on the site. Uses the same rules as the
 * renderer: the surface is pulled to clearly light or dark, and a button's label
 * is near-black or white, whichever reads better on the main colour.
 */
export function paletteWarnings(palette: Palette): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const surface = premiumSurface(palette.secondary) ?? "#ffffff";
  const label = isLight(palette.primary) ? "#101114" : "#ffffff";

  const buttonText = contrastRatio(label, palette.primary);
  if (buttonText !== null && buttonText < AA_TEXT) {
    warnings.push({
      id: "button-text",
      message: `Button text on the main colour is ${round(buttonText).toFixed(1)}:1; it needs ${AA_TEXT}:1 to be easy to read.`,
      ratio: round(buttonText),
      required: AA_TEXT,
    });
  }
  const buttonShape = contrastRatio(palette.primary, surface);
  if (buttonShape !== null && buttonShape < AA_UI) {
    warnings.push({
      id: "button-shape",
      message: `The main colour barely stands out from the page background (${round(buttonShape).toFixed(1)}:1; it needs ${AA_UI}:1), so buttons and borders may be hard to see.`,
      ratio: round(buttonShape),
      required: AA_UI,
    });
  }
  const accentShape = contrastRatio(palette.accent, surface);
  if (accentShape !== null && accentShape < AA_UI) {
    warnings.push({
      id: "accent-shape",
      message: `The highlight colour barely stands out from the page background (${round(accentShape).toFixed(1)}:1; it needs ${AA_UI}:1).`,
      ratio: round(accentShape),
      required: AA_UI,
    });
  }
  return warnings;
}

/** What the editor shows for the current page colours when none were saved yet. */
export const NEUTRAL_PALETTE: Palette = { primary: "#101114", secondary: "#ffffff", accent: "#101114" };

/** Fills any unsaved colour from the neutral blank state the renderer uses. */
export function paletteFromProfile(profile: {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
} | null | undefined): Palette {
  const primary = normalizeHex(profile?.primary_color) ?? NEUTRAL_PALETTE.primary;
  return {
    primary,
    secondary: normalizeHex(profile?.secondary_color) ?? NEUTRAL_PALETTE.secondary,
    // The renderer falls back to the main colour for the highlight.
    accent: normalizeHex(profile?.accent_color) ?? primary,
  };
}
