/**
 * Premium design system for generated client sites (/s/ and /draft/).
 *
 * One token module the site renderer applies on the site root, so every
 * existing section benefits without per-section edits:
 *  - type: a fluid clamp() ramp, line-height and letter-spacing, with a "voice"
 *    per curated font pairing (site-font-pairings.ts, max two families);
 *  - colour: the tinted neutral ramp from site-palette-ramp.ts, applied by
 *    siteThemeStyle (this module only adds the shadow tint and alt surface);
 *  - space and rhythm: a spacing scale, section padding, container widths,
 *    alternating section surfaces, radius and shadow tokens;
 *  - motion: `--motion-duration-*` and `--motion-ease-*` plain CSS variables,
 *    zeroed under prefers-reduced-motion. Other builder features (scroll
 *    reveal, mobile menu) read these instead of inventing their own timings.
 *
 * Everything the CSS declares sits in `@layer base` with zero-specificity
 * selectors, so a block's own style, a Tailwind utility or an AI layout's
 * inline style always wins: the system only fills in what nobody authored.
 *
 * Out of scope here on purpose: scroll-reveal and layout variants, wordmark and
 * mobile menu, images, overlays, footer/contact, the builder pipeline.
 */
import type { CSSProperties } from "react";
import { FONT_PAIRINGS, type FontPairing } from "@/lib/site-font-pairings";
import { siteHeadingFont } from "@/lib/site-theme";

/** Fluid type ramp. Each step is a clamp() between a phone and a wide-desktop size. */
export const TYPE_RAMP = {
  xs: "clamp(0.75rem, 0.73rem + 0.1vw, 0.8125rem)",
  sm: "clamp(0.875rem, 0.85rem + 0.12vw, 0.9375rem)",
  base: "clamp(1rem, 0.96rem + 0.2vw, 1.0625rem)",
  lg: "clamp(1.125rem, 1.05rem + 0.38vw, 1.3125rem)",
  xl: "clamp(1.3rem, 1.15rem + 0.7vw, 1.65rem)",
  "2xl": "clamp(1.6rem, 1.3rem + 1.4vw, 2.25rem)",
  "3xl": "clamp(2rem, 1.5rem + 2.4vw, 3.25rem)",
  "4xl": "clamp(2.4rem, 1.6rem + 3.8vw, 4.25rem)",
  "5xl": "clamp(2.75rem, 1.7rem + 5.2vw, 5.5rem)",
} as const;

/** 4px-based spacing scale (rem). */
export const SPACE_SCALE = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.5rem",
  6: "2rem",
  7: "3rem",
  8: "4rem",
  9: "6rem",
  10: "8rem",
} as const;

/** Motion tokens. Plain CSS variables; durations go to 0ms and easings to linear under reduced motion. */
export const MOTION_TOKENS = {
  "--motion-duration-fast": "120ms",
  "--motion-duration-base": "200ms",
  "--motion-duration-slow": "360ms",
  "--motion-duration-slower": "600ms",
  "--motion-ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  "--motion-ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--motion-ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
  "--motion-hover-lift": "-2px",
  "--motion-hover-scale": "1.015",
} as const;

/** Values the same variables take when the visitor asks for reduced motion. */
export const REDUCED_MOTION_TOKENS: Record<keyof typeof MOTION_TOKENS, string> = {
  "--motion-duration-fast": "0ms",
  "--motion-duration-base": "0ms",
  "--motion-duration-slow": "0ms",
  "--motion-duration-slower": "0ms",
  "--motion-ease-standard": "linear",
  "--motion-ease-out": "linear",
  "--motion-ease-in-out": "linear",
  "--motion-hover-lift": "0px",
  "--motion-hover-scale": "1",
};

export type TypeVoice = {
  /** Heading letter-spacing in em. */
  tracking: number;
  /** Heading line-height. */
  leading: number;
  /** Multiplier on the heading ramp: wide faces run smaller, condensed ones larger. */
  scale: number;
  /** Heading weight when nothing else sets one. */
  weight: number;
  /** Body line-height. */
  bodyLeading: number;
};

const DEFAULT_VOICE: TypeVoice = { tracking: -0.015, leading: 1.1, scale: 1, weight: 650, bodyLeading: 1.65 };

/** How each curated pairing is set. Keyed by FONT_PAIRINGS ids; a new pairing falls back to the default voice. */
export const TYPE_VOICES: Record<string, TypeVoice> = {
  "sturdy-friendly": { tracking: -0.02, leading: 1.08, scale: 1, weight: 700, bodyLeading: 1.65 },
  "warm-editorial": { tracking: -0.015, leading: 1.12, scale: 1.02, weight: 600, bodyLeading: 1.7 },
  "structural-wide": { tracking: -0.01, leading: 1.1, scale: 0.94, weight: 700, bodyLeading: 1.65 },
  "technical-energy": { tracking: -0.01, leading: 1.12, scale: 0.88, weight: 600, bodyLeading: 1.65 },
  "classic-elegance": { tracking: -0.01, leading: 1.15, scale: 1, weight: 600, bodyLeading: 1.7 },
  "quiet-luxury": { tracking: 0, leading: 1.08, scale: 1.1, weight: 500, bodyLeading: 1.7 },
  "trusted-professional": { tracking: -0.005, leading: 1.14, scale: 1, weight: 400, bodyLeading: 1.7 },
  "athletic-condensed": { tracking: 0.01, leading: 0.98, scale: 1.18, weight: 400, bodyLeading: 1.6 },
  "modern-refined": { tracking: -0.01, leading: 1.04, scale: 1.12, weight: 400, bodyLeading: 1.7 },
  "rugged-civic": { tracking: 0.005, leading: 1.02, scale: 1.12, weight: 700, bodyLeading: 1.65 },
  "craft-kitchen": { tracking: -0.01, leading: 1.12, scale: 1.02, weight: 400, bodyLeading: 1.7 },
  "editorial-advisor": { tracking: -0.02, leading: 1.1, scale: 1, weight: 650, bodyLeading: 1.7 },
};

/** The pairing whose display face a site's `Heading|Body` preference uses, if it is one of ours. */
export function pairingForPreference(preference: string | null | undefined): FontPairing | null {
  const heading = siteHeadingFont(preference);
  return heading ? (FONT_PAIRINGS.find((pairing) => pairing.display === heading) ?? null) : null;
}

export function typeVoiceFor(preference: string | null | undefined): TypeVoice {
  const pairing = pairingForPreference(preference);
  return (pairing && TYPE_VOICES[pairing.id]) || DEFAULT_VOICE;
}

/** Number of font families a preference loads (heading + body, deduplicated). Never more than two by design. */
export function familyCount(preference: string | null | undefined): number {
  const [heading, body] = (preference ?? "").split("|").map((part) => part.trim()).filter(Boolean);
  return new Set([heading, body].filter(Boolean)).size;
}

/**
 * Inline CSS variables that depend on the site's chosen type. The static
 * ramp, spacing and motion tokens come from `designSystemCss()`.
 */
export function designSystemVars(preference: string | null | undefined): CSSProperties {
  const voice = typeVoiceFor(preference);
  return {
    "--ds-heading-tracking": `${voice.tracking}em`,
    "--ds-heading-leading": String(voice.leading),
    "--ds-heading-weight": String(voice.weight),
    "--ds-display-scale": String(voice.scale),
    "--ds-body-leading": String(voice.bodyLeading),
  } as CSSProperties;
}

const decl = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

/**
 * The design system's stylesheet. One block per site page; the selectors are
 * zero-specificity inside `@layer base`, so anything authored beats them.
 */
export function designSystemCss(): string {
  const ramp = decl(Object.fromEntries(Object.entries(TYPE_RAMP).map(([step, value]) => [`--ds-text-${step}`, value])));
  const space = decl(Object.fromEntries(Object.entries(SPACE_SCALE).map(([step, value]) => [`--ds-space-${step}`, value])));
  const root = ":where(.rv-site-root)";
  return [
    "@layer base{",
    // Tokens.
    `${root}{${ramp};${space};${decl(MOTION_TOKENS)};` +
      "--ds-section-y:calc(clamp(3.5rem,7vw,7.5rem) * var(--site-space,1));" +
      "--ds-gutter:clamp(1rem,3vw,2.5rem);--ds-container-narrow:44rem;--ds-container:72rem;--ds-container-wide:80rem;" +
      "--ds-radius-sm:6px;--ds-radius-md:var(--radius,12px);--ds-radius-lg:calc(var(--radius,12px) * 1.5);--ds-radius-xl:calc(var(--radius,12px) * 2.25);" +
      "--ds-shadow-1:0 1px 2px rgb(var(--ds-shadow-rgb,16 17 20) / .06),0 1px 3px rgb(var(--ds-shadow-rgb,16 17 20) / .05);" +
      "--ds-shadow-2:0 2px 6px rgb(var(--ds-shadow-rgb,16 17 20) / .06),0 8px 24px rgb(var(--ds-shadow-rgb,16 17 20) / .08);" +
      "--ds-shadow-3:0 6px 16px rgb(var(--ds-shadow-rgb,16 17 20) / .08),0 24px 56px rgb(var(--ds-shadow-rgb,16 17 20) / .14);" +
      "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}",
    // Headings and copy: only where nothing else sets a value.
    `${root} :is(h1,h2,h3,h4){font-family:var(--font-heading);font-weight:var(--ds-heading-weight,650);letter-spacing:var(--ds-heading-tracking,-0.015em);line-height:var(--ds-heading-leading,1.1);text-wrap:balance}`,
    `${root} h1{font-size:calc(var(--ds-text-4xl) * var(--ds-display-scale,1))}`,
    `${root} h2{font-size:calc(var(--ds-text-3xl) * var(--ds-display-scale,1))}`,
    `${root} h3{font-size:var(--ds-text-xl)}`,
    `${root} h4{font-size:var(--ds-text-lg)}`,
    `${root} :is(p,li){line-height:var(--ds-body-leading,1.65);text-wrap:pretty}`,
    // Quiet alternating bands on unpainted sections. Studio canvases and sections
    // with their own background are left alone.
    `${root}:not([data-studio]) main>.rv-site-section:nth-child(even):not([style*="background"]){background-color:var(--ds-surface-alt,transparent)}`,
    // Interaction: one timing language for hover and focus.
    `${root} :is(a,button,summary,[role="button"]){transition:color var(--motion-duration-base) var(--motion-ease-standard),background-color var(--motion-duration-base) var(--motion-ease-standard),border-color var(--motion-duration-base) var(--motion-ease-standard),box-shadow var(--motion-duration-base) var(--motion-ease-standard),transform var(--motion-duration-base) var(--motion-ease-out)}`,
    `${root} :is(a,button,[role="button"])[class*="bg-primary"]:hover{transform:translateY(var(--motion-hover-lift))}`,
    `${root} :is(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--primary-ink,currentColor);outline-offset:3px}`,
    "}",
    // Reduced motion: unlayered so it beats the token block above.
    `@media (prefers-reduced-motion:reduce){.rv-site-root{${decl(REDUCED_MOTION_TOKENS)}}}`,
  ].join("\n");
}
