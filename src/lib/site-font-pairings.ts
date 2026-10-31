/**
 * Curated type pairings for client websites.
 *
 * Every site used to render in the same grotesk: the database seeds
 * "Space Grotesk" (the Revora platform face) on every business profile, the
 * site renderer used that seed as if the owner had chosen it, and the build
 * only replaced it when the owner had no brand colours either. AI layouts then
 * copied the seeded name into their headings. Sites now get one of these
 * pairings — a distinctive display face plus a refined body face, all free
 * Google Fonts (OFL) — unless the owner or the AI design team chose a
 * distinctive family. The pick is deterministic per site and niche, so a site
 * keeps its type across renders while two plumbers rarely share one.
 */
import { blueprintFor } from "@/lib/builder/industry-playbook";
import { isGenericFace, siteBodyFont, siteHeadingFont } from "@/lib/site-theme";

export { GENERIC_FACES, isGenericFace } from "@/lib/site-theme";

export type FontPairing = {
  id: string;
  display: string;
  body: string;
  mood: string;
  /** Trade blueprint keys (see trade-blueprints.ts) this pairing suits. */
  niches: readonly string[];
};

export const FONT_PAIRINGS: readonly FontPairing[] = [
  { id: "sturdy-friendly", display: "Bricolage Grotesque", body: "Figtree", mood: "confident, friendly trade", niches: ["plumbing", "cleaning", "hvac", "landscaping"] },
  { id: "warm-editorial", display: "Fraunces", body: "Commissioner", mood: "warm, crafted, local", niches: ["landscaping", "restaurants", "cleaning", "real-estate", "golf-course"] },
  { id: "structural-wide", display: "Syne", body: "Work Sans", mood: "structural, architectural", niches: ["roofing", "real-estate", "plumbing"] },
  { id: "technical-energy", display: "Unbounded", body: "Manrope", mood: "technical, high-energy", niches: ["auto-detailing", "hvac", "gyms-fitness", "pressure-washing", "watersports-rentals"] },
  { id: "classic-elegance", display: "Playfair Display", body: "Karla", mood: "classic, assured", niches: ["law-firms", "salons-barbers", "restaurants", "golf-course"] },
  { id: "quiet-luxury", display: "Cormorant Garamond", body: "Manrope", mood: "quiet luxury", niches: ["med-spa", "salons-barbers", "real-estate", "home-builder"] },
  { id: "trusted-professional", display: "DM Serif Display", body: "IBM Plex Sans", mood: "trustworthy, professional", niches: ["dentist", "law-firms", "med-spa"] },
  { id: "athletic-condensed", display: "Bebas Neue", body: "Barlow", mood: "athletic, bold", niches: ["gyms-fitness", "auto-detailing", "roofing", "watersports-rentals"] },
  { id: "modern-refined", display: "Instrument Serif", body: "Plus Jakarta Sans", mood: "modern, refined", niches: ["med-spa", "real-estate", "salons-barbers", "dentist", "home-builder"] },
  { id: "rugged-civic", display: "Big Shoulders Display", body: "Public Sans", mood: "rugged, dependable", niches: ["pressure-washing", "roofing", "plumbing", "hvac"] },
  { id: "craft-kitchen", display: "Young Serif", body: "Instrument Sans", mood: "handmade, appetising", niches: ["restaurants", "landscaping", "cleaning"] },
  { id: "editorial-advisor", display: "Schibsted Grotesk", body: "Newsreader", mood: "editorial, considered", niches: ["law-firms", "dentist", "auto-detailing"] },
];

/** FNV-1a: small, stable across runtimes, good enough to spread sites over a handful of pairings. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The pairing for a site: drawn from the pairings that suit its niche, fixed by its id. */
export function pickFontPairing(siteKey: string | null | undefined, niche: string | null | undefined): FontPairing {
  const key = (niche ?? "").trim().toLowerCase();
  const suited = FONT_PAIRINGS.filter((pairing) => pairing.niches.includes(key));
  const pool = suited.length ? suited : FONT_PAIRINGS;
  return pool[hash(`${siteKey ?? ""}|${key}`) % pool.length]!;
}

export const pairingPreference = (pairing: FontPairing): string => `${pairing.display}|${pairing.body}`;

/**
 * The `Heading|Body` preference a site renders with. A distinctive stored
 * heading face (the owner's pick or the AI design team's) is kept; a missing,
 * seeded or stock one is replaced by the site's curated pairing. A distinctive
 * heading stored without a body (or with a stock body) keeps its heading and
 * borrows the pairing's body face.
 */
export function resolveSiteFont(
  preference: string | null | undefined,
  site: { siteKey: string | null | undefined; niche: string | null | undefined },
): string {
  const pairing = pickFontPairing(site.siteKey, site.niche);
  const heading = siteHeadingFont(preference);
  if (!heading || isGenericFace(heading)) return pairingPreference(pairing);
  const body = siteBodyFont(preference);
  return `${heading}|${body && !isGenericFace(body) ? body : pairing.body}`;
}

/** The type a business's site renders with, from its stored preference and its trade. */
export function siteFontFor(
  preference: string | null | undefined,
  org: { id?: string | null; slug?: string | null; industry?: string | null },
): string {
  return resolveSiteFont(preference, {
    siteKey: org.id ?? org.slug ?? null,
    niche: blueprintFor(org.industry ?? null)?.key ?? null,
  });
}
