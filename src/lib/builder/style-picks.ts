/**
 * The "pick a look" cards in the intake wizard's Look & photos step.
 *
 * Each card is only a pointer at an existing curated palette (PALETTE_PRESETS)
 * and type pairing (FONT_PAIRINGS) plus one plain-English line about the layout
 * feel. Nothing new is stored: choosing a card writes the same business-profile
 * colours and `font_preference` the owner could type by hand, so the first build
 * already treats them as the owner's choice. The build recognises the pick again
 * from those saved values (`styleFromProfile`), so no migration or extra column
 * is needed. Skipping changes nothing: the AI design team chooses, as before.
 */
import { FONT_PAIRINGS, pairingPreference, type FontPairing } from "@/lib/site-font-pairings";
import { PALETTE_PRESETS, matchingPreset, type Palette, type PalettePreset } from "@/lib/builder/palette-edit";

export type StylePick = {
  id: string;
  name: string;
  /** What the layout will feel like, in the owner's words. */
  feel: string;
  paletteId: string;
  pairingId: string;
};

/** What a chosen card means for the build. */
export type OwnerStyleChoice = {
  id: string;
  name: string;
  feel: string;
  palette: Palette;
  display: string;
  body: string;
};

export type ResolvedStylePick = StylePick & { palette: PalettePreset; pairing: FontPairing };

export const STYLE_PICKS: readonly StylePick[] = [
  { id: "clean-trust", name: "Clean & trustworthy", feel: "Big clear headings, roomy cards and one strong call-to-action button.", paletteId: "ocean", pairingId: "sturdy-friendly" },
  { id: "warm-crafted", name: "Warm & crafted", feel: "Photo-led pages with an editorial feel and softer, rounded cards.", paletteId: "forest", pairingId: "warm-editorial" },
  { id: "dark-premium", name: "Dark & premium", feel: "Full-width photos, generous spacing and thin, elegant type on a dark page.", paletteId: "midnight", pairingId: "quiet-luxury" },
];

export function resolveStylePick(pick: StylePick): ResolvedStylePick | null {
  const palette = PALETTE_PRESETS.find((preset) => preset.id === pick.paletteId);
  const pairing = FONT_PAIRINGS.find((entry) => entry.id === pick.pairingId);
  return palette && pairing ? { ...pick, palette, pairing } : null;
}

export function resolvedStylePicks(): ResolvedStylePick[] {
  return STYLE_PICKS.map(resolveStylePick).filter((entry): entry is ResolvedStylePick => entry !== null);
}

/** The business-profile columns a card writes (the same ones the owner can type into). */
export function styleProfilePatch(pick: ResolvedStylePick): Record<string, string> {
  return {
    primary_color: pick.palette.primary,
    secondary_color: pick.palette.secondary,
    accent_color: pick.palette.accent,
    font_preference: pairingPreference(pick.pairing),
  };
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** The card the saved profile currently matches exactly, or null when the owner chose nothing or something else. */
export function styleFromProfile(
  profile: { primary_color?: unknown; secondary_color?: unknown; accent_color?: unknown; font_preference?: unknown } | null | undefined,
): ResolvedStylePick | null {
  if (!profile) return null;
  const palette = matchingPreset({
    primary: clean(profile.primary_color),
    secondary: clean(profile.secondary_color),
    accent: clean(profile.accent_color),
  });
  if (!palette) return null;
  const font = clean(profile.font_preference);
  return (
    resolvedStylePicks().find((pick) => pick.palette.id === palette.id && clean(pairingPreference(pick.pairing)) === font) ?? null
  );
}

/** What the design contract records for a matched card. */
export function ownerStyleChoice(pick: ResolvedStylePick | null): OwnerStyleChoice | null {
  if (!pick) return null;
  return {
    id: pick.id,
    name: pick.name,
    feel: pick.feel,
    palette: { primary: pick.palette.primary, secondary: pick.palette.secondary, accent: pick.palette.accent },
    display: pick.pairing.display,
    body: pick.pairing.body,
  };
}
