/**
 * Published-site theming (pure layer).
 *
 * Client websites are rendered with the same token-based design system as the
 * app, so a tenant's chosen brand colours are applied by overriding the CSS
 * variables on the site's outermost element — never by hardcoding colours in
 * components.
 *
 * This is what lets one client have a black-and-gold site, another a clean white
 * site and another a deep blue one, from the same components. The surface
 * colour decides whether the site renders in a light or dark scheme, so text
 * contrast stays readable either way.
 */

import type { CSSProperties } from "react";
import { mutedOn } from "@/lib/readable-color";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed : null;
};

const expand = (hex: string) =>
  hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex.toLowerCase();

const channels = (hex: string): [number, number, number] => {
  const full = expand(hex);
  return [
    parseInt(full.slice(1, 3), 16) / 255,
    parseInt(full.slice(3, 5), 16) / 255,
    parseInt(full.slice(5, 7), 16) / 255,
  ];
};

const lin = (channel: number) =>
  channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Whether text on this colour should be dark. */
export const isLight = (hex: string) => luminance(hex) > 0.45;

/** "light" when the site's surface colour is pale — used for copy and UI tone. */
export function siteTone(secondaryColor: string | null | undefined): "light" | "dark" {
  const surface = clean(secondaryColor);
  return surface && isLight(surface) ? "light" : "dark";
}

const mix = (a: string, b: string, percent: number) =>
  `color-mix(in oklab, ${a} ${Math.round(percent)}%, ${b})`;

/**
 * CSS variable overrides for a tenant's website. Returns `undefined` when the
 * client has not chosen colours, so the default Revora dark/gold identity is
 * used untouched.
 */
export function siteThemeStyle(input: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
}): CSSProperties | undefined {
  const primary = clean(input.primaryColor);
  const surface = clean(input.secondaryColor);
  const accent = clean(input.accentColor) ?? primary;
  if (!primary && !surface) return undefined;

  const background = surface ?? "#141416";
  const light = isLight(background);
  const ink = light ? "#101114" : "#f7f7f8";
  const onPrimary = primary && isLight(primary) ? "#101114" : "#ffffff";
  const onAccent = accent && isLight(accent) ? "#101114" : "#ffffff";
  const step = (percent: number) => mix(light ? "#000000" : "#ffffff", background, percent);

  const vars: Record<string, string> = {
    "--background": background,
    "--foreground": ink,
    "--card": step(light ? 3 : 5),
    "--card-foreground": ink,
    "--elevated": step(light ? 5 : 8),
    "--popover": step(light ? 4 : 7),
    "--popover-foreground": ink,
    "--secondary": step(light ? 5 : 8),
    "--secondary-foreground": ink,
    "--muted": step(light ? 5 : 8),
    // Supporting copy is softened, then re-measured: "muted" must never mean
    // "unreadable" on a pale or mid-tone brand surface.
    "--muted-foreground": mutedOn(ink, background),
    "--border": step(light ? 12 : 14),
    "--input": step(light ? 12 : 14),
    "--sidebar": step(light ? 2 : 3),
  };

  if (primary) {
    vars["--primary"] = primary;
    vars["--primary-foreground"] = onPrimary;
    vars["--ring"] = primary;
    vars["--gold"] = primary;
    vars["--gold-deep"] = mix("#000000", primary, 18);
    vars["--chart-1"] = primary;
  }
  if (accent) {
    vars["--accent"] = accent;
    vars["--accent-foreground"] = onAccent;
    vars["--gold-soft"] = accent;
    vars["--chart-2"] = accent;
  }

  return vars as CSSProperties;
}

/**
 * Heading fonts a client website may use.
 *
 * These entries carry a hand-tuned weight/axis request. They are NOT the limit
 * of what a design may choose: any real family name that passes the safe-name
 * check below is used as written, with a standard weight request. Safety comes
 * from the character check, never from a fixed menu of looks.
 */
export const SITE_HEADING_FONTS: Record<string, string> = {
  Anton: "Anton",
  "Archivo Black": "Archivo+Black",
  "Bebas Neue": "Bebas+Neue",
  "Bricolage Grotesque": "Bricolage+Grotesque:wght@500;600;700",
  Chivo: "Chivo:wght@500;600;700",
  "Cormorant Garamond": "Cormorant+Garamond:wght@500;600;700",
  "DM Serif Display": "DM+Serif+Display",
  Epilogue: "Epilogue:wght@500;600;700",
  Figtree: "Figtree:wght@500;600;700",
  Fraunces: "Fraunces:wght@500;600;700",
  Geist: "Geist:wght@500;600;700",
  "IBM Plex Sans": "IBM+Plex+Sans:wght@500;600;700",
  Inter: "Inter:wght@500;600;700",
  "Instrument Serif": "Instrument+Serif",
  Jost: "Jost:wght@500;600;700",
  Karla: "Karla:wght@500;600;700",
  "Libre Baskerville": "Libre+Baskerville:wght@400;700",
  Lora: "Lora:wght@500;600;700",
  Manrope: "Manrope:wght@500;600;700",
  Marcellus: "Marcellus",
  Merriweather: "Merriweather:wght@400;700",
  Oswald: "Oswald:wght@500;600;700",
  Outfit: "Outfit:wght@500;600;700",
  "Playfair Display": "Playfair+Display:wght@500;600;700",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@500;600;700",
  "Public Sans": "Public+Sans:wght@500;600;700",
  Rubik: "Rubik:wght@500;600;700",
  "Schibsted Grotesk": "Schibsted+Grotesk:wght@500;600;700",
  Sora: "Sora:wght@500;600;700",
  "Space Grotesk": "Space+Grotesk:wght@500;600;700",
  Spectral: "Spectral:wght@500;600;700",
  Syne: "Syne:wght@600;700;800",
  Urbanist: "Urbanist:wght@500;600;700",
  "Work Sans": "Work+Sans:wght@500;600;700",
};

const SERIF_FONTS = new Set([
  "Cormorant Garamond",
  "DM Serif Display",
  "Fraunces",
  "Instrument Serif",
  "Libre Baskerville",
  "Lora",
  "Marcellus",
  "Merriweather",
  "Playfair Display",
  "Spectral",
]);

/**
 * Families that ship a real italic face, with the exact axis request that
 * returns it. Every entry here was checked against Google Fonts: asking for an
 * italic a family does not have returns an upright face and the browser fakes
 * the slant, which looks cheap on a headline — so families without a genuine
 * italic (Oswald, Marcellus, Syne, Sora, Manrope, Outfit, Space Grotesk,
 * Bricolage Grotesque, and the single-weight display faces) are left out.
 */
const SITE_ITALIC_FONTS: Record<string, string> = {
  Chivo: "Chivo:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Cormorant Garamond": "Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "DM Serif Display": "DM+Serif+Display:ital@0;1",
  Epilogue: "Epilogue:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Figtree: "Figtree:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Fraunces: "Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Geist: "Geist:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "IBM Plex Sans": "IBM+Plex+Sans:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Instrument Serif": "Instrument+Serif:ital@0;1",
  Inter: "Inter:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Jost: "Jost:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Karla: "Karla:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Libre Baskerville": "Libre+Baskerville:ital,wght@0,400;0,700;1,400",
  Lora: "Lora:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Merriweather: "Merriweather:ital,wght@0,400;0,700;1,400;1,700",
  "Playfair Display": "Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Public Sans": "Public+Sans:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Rubik: "Rubik:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Schibsted Grotesk": "Schibsted+Grotesk:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Spectral: "Spectral:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  Urbanist: "Urbanist:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
  "Work Sans": "Work+Sans:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700",
};

/** True when the site's heading font can render a genuine italic. */
export function siteFontHasItalic(value: string | null | undefined): boolean {
  const font = siteHeadingFont(value);
  return font !== null && font in SITE_ITALIC_FONTS;
}

/**
 * A font family name is safe when it is plain letters, digits and single spaces.
 * That is what keeps it out of CSS and URL syntax; it places no limit on which
 * typeface a design may ask for.
 */
const SAFE_FONT_NAME = /^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+){0,4}$/;

function readFontName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 42) return null;
  const known = Object.keys(SITE_HEADING_FONTS).find(
    (name) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (known) return known;
  return SAFE_FONT_NAME.test(trimmed) ? trimmed : null;
}

/** The font family for a stored preference, or null when it is not a name. */
export function siteHeadingFont(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return readFontName(value.split("|")[0] ?? "");
}

/** Optional body family stored beside the heading family as `Heading|Body`. */
export function siteBodyFont(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const part = value.split("|")[1];
  return part === undefined ? null : readFontName(part);
}

/**
 * The stylesheet a site needs for its chosen heading font. Returns null when
 * the site uses the default face, so no extra request is made.
 */
export function siteFontHref(value: string | null | undefined): string | null {
  const font = siteHeadingFont(value);
  if (!font) return null;
  // Request the italic face too when the family has one, so an AI-chosen
  // italic headline renders as a designed italic rather than a faked slant.
  const families = [font, siteBodyFont(value)]
    .filter((name): name is string => Boolean(name))
    .filter((name, index, all) => all.indexOf(name) === index)
    .map(
      (name) =>
        SITE_ITALIC_FONTS[name] ??
        SITE_HEADING_FONTS[name] ??
        // A family chosen outside the tuned list: ask for the weights the
        // renderer uses. Google Fonts serves the nearest available faces.
        `${name.replace(/ /g, "+")}:wght@400;500;600;700`,
    );
  return `https://fonts.googleapis.com/css2?${families.map((family) => `family=${family}`).join("&")}&display=swap`;
}

/**
 * CSS variable override that makes the chosen heading font actually render.
 * Without this a client's font choice was stored but never seen.
 */
export function siteFontStyle(value: string | null | undefined): CSSProperties | undefined {
  const font = siteHeadingFont(value);
  if (!font) return undefined;
  const fallback = SERIF_FONTS.has(font) ? "Georgia, serif" : "system-ui, sans-serif";
  const body = siteBodyFont(value);
  const bodyFallback = body && SERIF_FONTS.has(body) ? "Georgia, serif" : "system-ui, sans-serif";
  return {
    "--font-heading": `"${font}", ${fallback}`,
    ...(body ? { "--font-body": `"${body}", ${bodyFallback}` } : {}),
  } as CSSProperties;
}
