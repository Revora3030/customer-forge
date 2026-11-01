/**
 * Deterministic layout-variant choice for generated-site sections.
 *
 * Plain (non-AI) sections are drawn from their own saved words and pictures.
 * Without variety every such section of a kind looks the same on every site.
 * The variant is picked from a stable seed (the site's slug plus the section's
 * own id), so the same section always draws the same way (no flicker between
 * server and browser, none between visits) while different sites and different
 * sections differ. With no seed the default layout (index 0) is used, and an
 * unknown or out-of-range request also falls back to the default. Nothing is
 * stored, so no database column or migration is involved.
 */

export type SectionVariantGroup = "hero" | "cards" | "proof" | "about" | "cta";

/** How many layouts each group has. Index 0 is always the original default. */
export const VARIANT_COUNTS: Readonly<Record<SectionVariantGroup, number>> = {
  hero: 3,
  cards: 3,
  proof: 3,
  about: 3,
  cta: 3,
};

/** 32-bit FNV-1a: tiny, stable across runtimes, no dependency. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Picks a variant index for a section. Returns 0 (the default layout) when
 * there is no usable seed or the group is unknown.
 */
export function pickVariant(group: SectionVariantGroup, sectionId: string, seed?: string | null): number {
  const count = VARIANT_COUNTS[group];
  const cleanSeed = typeof seed === "string" ? seed.trim() : "";
  if (!count || count < 2 || !cleanSeed) return 0;
  const picked = hashSeed(`${cleanSeed}|${group}|${sectionId}`) % count;
  return Number.isInteger(picked) && picked >= 0 && picked < count ? picked : 0;
}
