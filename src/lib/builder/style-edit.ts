/**
 * TOKEN INSPECTOR v2: the type, corner and spacing choices in the preview's
 * theme editor. Every choice maps onto values the site already renders:
 *
 * - Font pairs come only from FONT_PAIRINGS (site-font-pairings.ts), the curated
 *   free Google Fonts (SIL OFL) the public site already loads through its one
 *   fonts stylesheet. Nothing else can be picked or saved.
 * - Corners and spacing are the existing design tokens (radius, buttonRadius,
 *   space) in website_settings.generation; no new table or column.
 */
import { FONT_PAIRINGS, pairingPreference, type FontPairing } from "@/lib/site-font-pairings";
import { designTokenVars, type DesignTokens } from "@/lib/builder/design-tokens";
import { siteBodyFont, siteFontStyle, siteFontsHref, siteHeadingFont } from "@/lib/site-theme";

export const RADIUS_CHOICES = ["sharp", "subtle", "pill"] as const;
export const DENSITY_CHOICES = ["compact", "comfortable", "airy"] as const;
export type RadiusChoice = (typeof RADIUS_CHOICES)[number];
export type DensityChoice = (typeof DENSITY_CHOICES)[number];

export const RADIUS_LABELS: Record<RadiusChoice, string> = {
  sharp: "Sharp",
  subtle: "Subtle",
  pill: "Pill",
};
export const DENSITY_LABELS: Record<DensityChoice, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  airy: "Airy",
};

const RADIUS_TOKENS: Record<RadiusChoice, Pick<DesignTokens, "radius" | "buttonRadius">> = {
  sharp: { radius: 0, buttonRadius: 0 },
  subtle: { radius: 8, buttonRadius: 8 },
  pill: { radius: 16, buttonRadius: 999 },
};
const DENSITY_TOKENS: Record<DensityChoice, Pick<DesignTokens, "space">> = {
  compact: { space: 0.8 },
  comfortable: { space: 1 },
  airy: { space: 1.3 },
};

export type SiteStyle = {
  pairingId: string | null;
  radius: RadiusChoice | null;
  density: DensityChoice | null;
};

export const EMPTY_STYLE: SiteStyle = { pairingId: null, radius: null, density: null };

const isIn = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === "string" && (list as readonly string[]).includes(value);

export const pairingById = (id: unknown): FontPairing | null =>
  typeof id === "string" ? (FONT_PAIRINGS.find((pairing) => pairing.id === id) ?? null) : null;

/** The curated pair a stored `Heading|Body` preference matches, else null (a custom or seeded face). */
export function pairingIdOf(preference: string | null | undefined): string | null {
  const heading = siteHeadingFont(preference);
  const body = siteBodyFont(preference);
  return (
    FONT_PAIRINGS.find((pairing) => pairing.display === heading && pairing.body === body)?.id ??
    null
  );
}

/** Nearest corner choice for stored tokens; null when none were ever set. */
export function radiusChoiceOf(tokens: DesignTokens | null): RadiusChoice | null {
  if (tokens?.radius === undefined && tokens?.buttonRadius === undefined) return null;
  if ((tokens?.buttonRadius ?? 0) >= 100) return "pill";
  return (tokens?.radius ?? tokens?.buttonRadius ?? 0) <= 2 ? "sharp" : "subtle";
}

/** Nearest spacing choice for stored tokens; null when never set. */
export function densityChoiceOf(tokens: DesignTokens | null): DensityChoice | null {
  const space = tokens?.space;
  if (space === undefined) return null;
  if (space < 0.9) return "compact";
  return space > 1.15 ? "airy" : "comfortable";
}

export function styleFromStored(
  fontPreference: string | null | undefined,
  tokens: DesignTokens | null,
): SiteStyle {
  return {
    pairingId: pairingIdOf(fontPreference),
    radius: radiusChoiceOf(tokens),
    density: densityChoiceOf(tokens),
  };
}

/** Validates untrusted input (server and preview bridge): unknown ids and enums become null. */
export function readSiteStyle(input: unknown): SiteStyle {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    pairingId: pairingById(row["pairingId"])?.id ?? null,
    radius: isIn(RADIUS_CHOICES, row["radius"]) ? row["radius"] : null,
    density: isIn(DENSITY_CHOICES, row["density"]) ? row["density"] : null,
  };
}

export const sameStyle = (a: SiteStyle, b: SiteStyle) =>
  a.pairingId === b.pairingId && a.radius === b.radius && a.density === b.density;

/** Design tokens to merge for a style (only the parts that were chosen). */
export function styleTokens(style: SiteStyle): DesignTokens {
  return {
    ...(style.radius ? RADIUS_TOKENS[style.radius] : {}),
    ...(style.density ? DENSITY_TOKENS[style.density] : {}),
  };
}

/** The `Heading|Body` preference to save, or null when no curated pair was chosen. */
export function stylePreference(style: SiteStyle): string | null {
  const pairing = pairingById(style.pairingId);
  return pairing ? pairingPreference(pairing) : null;
}

/** What the preview applies live: CSS variables, opt-in classes and the fonts stylesheet. */
export function stylePreviewPatch(style: SiteStyle): {
  vars: Record<string, string>;
  classes: string[];
  fontsHref: string | null;
} {
  const tokens = styleTokens(style);
  const preference = stylePreference(style);
  const vars: Record<string, string> = {
    ...designTokenVars(tokens),
    ...((siteFontStyle(preference) ?? {}) as Record<string, string>),
  };
  return {
    vars,
    classes: tokens.buttonRadius !== undefined ? ["rv-btn-radius"] : [],
    fontsHref: preference ? siteFontsHref(preference, []) : null,
  };
}
