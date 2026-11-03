/**
 * Tinted neutral ramp for client websites (premium design system).
 *
 * A generated site used to paint its surfaces from pure white or pure black
 * mixed with grey, which reads as "stark colour blocks". This derives the
 * neutrals (page, card, alternate section, border, text, muted text) from the
 * brand primary instead: the same hue at a whisper of saturation, so greys feel
 * designed and belong to the brand.
 *
 * Rules kept from the existing theming:
 *  - an explicit, non-pure page surface chosen by the owner or AI is never
 *    replaced, only used as the base of the ramp;
 *  - no schema change: the inputs are the three stored brand colours;
 *  - every text colour is re-measured with the shared contrast helpers
 *    (readable-color.ts, the same ones palette-edit.ts uses) and lands on AA.
 *
 * Pure functions, no React: shared by siteThemeStyle and the tests.
 */
import { AA_NORMAL, contrastRatio, mutedOn, readableOn, toRgb } from "@/lib/readable-color";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function cleanHex(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!HEX.test(raw)) return null;
  return raw.length === 4 ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase() : raw.toLowerCase();
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

/** Hue 0-360, saturation and lightness 0-1. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = toRgb(hex) ?? { r: 0, g: 0, b: 0 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Linear mix of two hex colours; `amount` is the share of `b` (0-1). */
export function mixHex(a: string, b: string, amount: number): string {
  const x = toRgb(a) ?? { r: 0, g: 0, b: 0 };
  const y = toRgb(b) ?? { r: 0, g: 0, b: 0 };
  const t = Math.min(1, Math.max(0, amount));
  return toHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
}

const lum = (hex: string) => {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
};

/** Near-black or white, whichever reads better on `background` (the label colour for a filled button). */
export function onColour(background: string): string {
  const dark = "#101114";
  const light = "#ffffff";
  const onDark = contrastRatio(dark, background) ?? 0;
  const onLight = contrastRatio(light, background) ?? 0;
  return onDark >= onLight ? dark : light;
}

export type NeutralRamp = {
  scheme: "light" | "dark";
  /** Page background. */
  background: string;
  /** Cards and panels: a step off the page. */
  surface: string;
  /** Alternate section band: a quiet step the other way. */
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  /** Body text and headings. */
  text: string;
  /** Supporting copy; AA on background, surface and surfaceAlt. */
  textMuted: string;
  /** Label colour for the brand primary, AA by construction (null with no primary). */
  onPrimary: string | null;
  /** Tinted shadow colour as "r g b" for `rgb(r g b / a)`. */
  shadowRgb: string;
};

const isPure = (hex: string) => hex === "#ffffff" || hex === "#000000";

/**
 * The tinted neutral ramp for a site.
 *
 * `surface` is the page surface after `premiumSurface` (so already clearly
 * light or dark) or null for the neutral blank state.
 */
export function tintedNeutralRamp(input: { primary?: string | null; surface?: string | null }): NeutralRamp {
  const primary = cleanHex(input.primary);
  const given = cleanHex(input.surface);
  const brand = primary ? hexToHsl(primary) : null;
  // Brand hue at low, bounded saturation. A grey or black brand adds no tint.
  const tint = brand && brand.s > 0.06 ? Math.min(0.14, Math.max(0.05, brand.s * 0.22)) : 0;
  const hue = brand?.h ?? 0;

  const light = given ? lum(given) > 0.18 : true;
  // A pure white/black surface (or none) is lifted to a tinted near-white or
  // near-black only when the brand gives a hue. Owner-chosen non-pure surfaces stay.
  const background =
    given && !isPure(given)
      ? given
      : tint > 0
        ? hslToHex(hue, tint * 0.85, light ? 0.985 : 0.075)
        : (given ?? "#ffffff");

  const inkRaw = tint > 0 ? hslToHex(hue, Math.min(0.3, tint * 1.6), light ? 0.09 : 0.96) : light ? "#101114" : "#f7f7f8";
  const surfaceAlt = mixHex(background, inkRaw, light ? 0.04 : 0.07);
  const surface = light ? mixHex(background, "#ffffff", 0.7) : mixHex(background, "#ffffff", 0.045);
  const border = mixHex(background, inkRaw, light ? 0.12 : 0.16);
  const borderStrong = mixHex(background, inkRaw, light ? 0.24 : 0.3);

  // Text must clear AA on every neutral it can sit on.
  const bands = [background, surface, surfaceAlt];
  const settle = (colour: string) => bands.reduce((current, band) => readableOn(current, band), colour);
  const text = settle(inkRaw);
  const textMuted = settle(bands.reduce((current, band) => mutedOn(current, band), text));

  const shadowSource = tint > 0 ? hslToHex(hue, Math.min(0.4, tint * 2.2), 0.12) : light ? "#101114" : "#000000";
  const s = toRgb(shadowSource) ?? { r: 16, g: 17, b: 20 };

  return {
    scheme: light ? "light" : "dark",
    background,
    surface,
    surfaceAlt,
    border,
    borderStrong,
    text,
    textMuted,
    onPrimary: primary ? onColour(primary) : null,
    shadowRgb: `${s.r} ${s.g} ${s.b}`,
  };
}

/** Lowest contrast between `text` and the three neutrals it can sit on. */
export function rampTextContrast(ramp: NeutralRamp, colour: "text" | "textMuted"): number {
  return Math.min(...[ramp.background, ramp.surface, ramp.surfaceAlt].map((band) => contrastRatio(ramp[colour], band) ?? 21));
}

export { AA_NORMAL };
