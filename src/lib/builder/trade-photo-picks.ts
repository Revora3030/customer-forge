import {
  gradePhotoForSlot,
  pexelsPhotoId,
  type FocalPoint,
  type PhotoFraming,
  type PhotoSlot,
  type PhotoStats,
} from "@/lib/builder/image-framing";
import type { StockPhoto } from "@/lib/builder/stock-photos";

/**
 * Curated free photography per trade, all from Pexels (Pexels License: free
 * for commercial use, no credit required, never imply the photographer endorses
 * the business). Every picture was opened on its Pexels page for the
 * photographer's name, fetched from the Pexels CDN with HTTP 200, and measured
 * offline with `scripts/score-trade-photos.py`. The measurements are stored so
 * the dark / low-contrast / close-up-only rules stay testable.
 *
 * Verified 2026-10-31. These show the trade, not a customer: they must never be
 * captioned as the business's own work or its own team.
 */
export type TradeKey = "plumbing" | "roofing" | "hvac" | "landscaping" | "cleaning" | "electrical" | "detailing";

export type TradePhotoPick = {
  trade: TradeKey;
  /** Pexels photo id. */
  id: string;
  photographer: string;
  alt: string;
  framing: PhotoFraming;
  /** Where the subject sits, as percentages, so crops keep it in view. */
  focal: FocalPoint;
  stats: PhotoStats;
};

export const TRADE_PHOTO_PICKS: TradePhotoPick[] = [
  {
    trade: "roofing",
    id: "33404248",
    photographer: "Ryan Stephens",
    alt: "Roofer using a nail gun to install shingles on a residential roof",
    framing: "medium",
    focal: { x: 50, y: 55 },
    stats: { aspect: 1.5, mean: 0.41, contrast: 0.19, darkShare: 0.12 },
  },
  {
    trade: "roofing",
    id: "38028508",
    photographer: "Ryan Stephens",
    alt: "Roofers installing shingles on a home under blue skies",
    framing: "wide",
    focal: { x: 55, y: 55 },
    stats: { aspect: 1.5, mean: 0.49, contrast: 0.13, darkShare: 0.01 },
  },
  {
    trade: "roofing",
    id: "31771166",
    photographer: "Clément Proust",
    alt: "Roofer installing shingles on a new residential roof",
    framing: "wide",
    focal: { x: 55, y: 30 },
    stats: { aspect: 0.667, mean: 0.53, contrast: 0.28, darkShare: 0.1 },
  },
  {
    trade: "roofing",
    id: "40017690",
    photographer: "D Goug",
    alt: "Suburban home with roof tiles being installed under a clear sky",
    framing: "wide",
    focal: { x: 50, y: 55 },
    stats: { aspect: 1.78, mean: 0.43, contrast: 0.18, darkShare: 0.09 },
  },
  {
    trade: "roofing",
    id: "18947368",
    photographer: "Mike Illy Essien",
    alt: "Red-tiled suburban rooftops under a blue sky",
    framing: "wide",
    focal: { x: 50, y: 60 },
    stats: { aspect: 1.5, mean: 0.48, contrast: 0.25, darkShare: 0.09 },
  },
  {
    trade: "hvac",
    id: "32497161",
    photographer: "Kathleen Austin Kuhn",
    alt: "Technician inspecting an outdoor HVAC unit",
    framing: "medium",
    focal: { x: 45, y: 50 },
    stats: { aspect: 1.5, mean: 0.56, contrast: 0.21, darkShare: 0.01 },
  },
  {
    trade: "hvac",
    id: "33671149",
    photographer: "Multitech Institute",
    alt: "Technician repairing an air conditioner unit in a workshop",
    framing: "medium",
    focal: { x: 60, y: 55 },
    stats: { aspect: 1.5, mean: 0.58, contrast: 0.3, darkShare: 0.14 },
  },
  {
    trade: "landscaping",
    id: "4162011",
    photographer: "Magda Ehlers",
    alt: "Person mowing green grass with a lawn mower",
    framing: "wide",
    focal: { x: 55, y: 55 },
    stats: { aspect: 1.5, mean: 0.36, contrast: 0.19, darkShare: 0.19 },
  },
  {
    trade: "landscaping",
    id: "5163424",
    photographer: "Gustavo Fring",
    alt: "Young man mowing the lawn on a sunny day",
    framing: "medium",
    focal: { x: 50, y: 40 },
    stats: { aspect: 0.667, mean: 0.46, contrast: 0.23, darkShare: 0.08 },
  },
  {
    trade: "landscaping",
    id: "40582861",
    photographer: "el jusuf",
    alt: "Gardener trimming hedges with a tiled roof in the background",
    framing: "medium",
    focal: { x: 50, y: 55 },
    stats: { aspect: 0.667, mean: 0.43, contrast: 0.24, darkShare: 0.16 },
  },
  {
    trade: "landscaping",
    id: "33688146",
    photographer: "Nothing Ahead",
    alt: "Gardener in a wide-brim hat trimming hedges outside a contemporary building",
    framing: "medium",
    focal: { x: 50, y: 55 },
    stats: { aspect: 0.667, mean: 0.53, contrast: 0.21, darkShare: 0.05 },
  },
  {
    trade: "landscaping",
    id: "38936338",
    photographer: "Magda Ehlers",
    alt: "Close-up of a gardener in a blue uniform trimming a hedge with shears",
    framing: "detail",
    focal: { x: 60, y: 45 },
    stats: { aspect: 1.5, mean: 0.4, contrast: 0.2, darkShare: 0.16 },
  },
  {
    trade: "cleaning",
    id: "6195277",
    photographer: "Tima Miroshnichenko",
    alt: "Two women in red overalls vacuuming and sweeping a modern living room",
    framing: "medium",
    focal: { x: 50, y: 50 },
    stats: { aspect: 1.5, mean: 0.53, contrast: 0.19, darkShare: 0.01 },
  },
  {
    trade: "cleaning",
    id: "6195288",
    photographer: "Tima Miroshnichenko",
    alt: "Two workers in protective gear vacuuming a modern living room",
    framing: "medium",
    focal: { x: 50, y: 50 },
    stats: { aspect: 1.5, mean: 0.61, contrast: 0.15, darkShare: 0.0 },
  },
  {
    trade: "cleaning",
    id: "6195957",
    photographer: "Tima Miroshnichenko",
    alt: "Person in a white protective suit holding a vacuum cleaner in a living room",
    framing: "medium",
    focal: { x: 50, y: 40 },
    stats: { aspect: 0.667, mean: 0.65, contrast: 0.15, darkShare: 0.01 },
  },
  {
    trade: "cleaning",
    id: "36729569",
    photographer: "Vitaly Gariev",
    alt: "Woman cleaning her bright, modern living room with a mop",
    framing: "wide",
    focal: { x: 50, y: 55 },
    stats: { aspect: 1.778, mean: 0.84, contrast: 0.15, darkShare: 0.01 },
  },
  {
    trade: "cleaning",
    id: "27176671",
    photographer: "Helena Lopes",
    alt: "Woman cleaning a living room with a vacuum cleaner",
    framing: "medium",
    focal: { x: 50, y: 50 },
    stats: { aspect: 1.5, mean: 0.4, contrast: 0.24, darkShare: 0.23 },
  },
  {
    trade: "electrical",
    id: "27928762",
    photographer: "ranjeet .",
    alt: "Electrician testing an electrical panel with a meter",
    framing: "medium",
    focal: { x: 55, y: 40 },
    stats: { aspect: 1.333, mean: 0.61, contrast: 0.27, darkShare: 0.07 },
  },
  {
    trade: "electrical",
    id: "257736",
    photographer: "Pixabay",
    alt: "Wired circuit breakers in an electrical panel",
    framing: "detail",
    focal: { x: 55, y: 45 },
    stats: { aspect: 1.502, mean: 0.52, contrast: 0.32, darkShare: 0.21 },
  },
  {
    trade: "electrical",
    id: "34054464",
    photographer: "Bulat843",
    alt: "Electrician diagnosing an open electrical panel with a multimeter",
    framing: "medium",
    focal: { x: 55, y: 45 },
    stats: { aspect: 0.563, mean: 0.48, contrast: 0.28, darkShare: 0.19 },
  },
  {
    trade: "electrical",
    id: "38524265",
    photographer: "Bulat843",
    alt: "Worker using a drill to install a ceiling fixture indoors",
    framing: "medium",
    focal: { x: 50, y: 35 },
    stats: { aspect: 0.563, mean: 0.44, contrast: 0.25, darkShare: 0.23 },
  },
  {
    trade: "detailing",
    id: "10446282",
    photographer: "Helena Jankovičová Kováčová",
    alt: "Car undergoing a wash in an automated car wash station",
    framing: "wide",
    focal: { x: 50, y: 55 },
    stats: { aspect: 1.5, mean: 0.43, contrast: 0.19, darkShare: 0.12 },
  },
  {
    trade: "detailing",
    id: "20042052",
    photographer: "WAVYVISUALS",
    alt: "Man polishing a car in a professional garage",
    framing: "medium",
    focal: { x: 55, y: 40 },
    stats: { aspect: 0.665, mean: 0.47, contrast: 0.26, darkShare: 0.14 },
  },
  {
    trade: "detailing",
    id: "20042055",
    photographer: "WAVYVISUALS",
    alt: "Man polishing a car hood in a professional garage",
    framing: "medium",
    focal: { x: 50, y: 40 },
    stats: { aspect: 0.665, mean: 0.47, contrast: 0.23, darkShare: 0.1 },
  },
  {
    trade: "detailing",
    id: "6870310",
    photographer: "Gustavo Fring",
    alt: "Mechanic in a blue uniform polishing a car body with a machine in a workshop",
    framing: "medium",
    focal: { x: 50, y: 40 },
    stats: { aspect: 0.667, mean: 0.44, contrast: 0.25, darkShare: 0.14 },
  },
  {
    trade: "plumbing",
    id: "32588548",
    photographer: "Bulat843",
    alt: "Close-up of a plumber in a blue uniform repairing a pipe with a wrench",
    framing: "detail",
    focal: { x: 50, y: 45 },
    stats: { aspect: 0.563, mean: 0.52, contrast: 0.28, darkShare: 0.17 },
  },
  {
    trade: "plumbing",
    id: "29226620",
    photographer: "Sergei Starostin",
    alt: "Close-up of a plumber installing a radiator pipe with specialised tools",
    framing: "detail",
    focal: { x: 50, y: 50 },
    stats: { aspect: 1.5, mean: 0.39, contrast: 0.26, darkShare: 0.2 },
  },
];

/** Pictures looked at and turned down, with the measured reason. */
export const REJECTED_TRADE_PHOTOS: Array<{ id: string; reason: string }> = [
  { id: "6873010", reason: "dark close-up of a car being brushed (mean 0.25, 48% near-black)" },
  { id: "6873129", reason: "dark: 45% near-black" },
  { id: "29945072", reason: "dark and heavily vignetted (mean 0.14)" },
  { id: "33694019", reason: "dark control-panel close-up (42% near-black)" },
  { id: "34054475", reason: "dark (32% near-black)" },
  { id: "35149470", reason: "dark portrait (29% near-black)" },
  { id: "5463580", reason: "dark (46% near-black)" },
  { id: "5463587", reason: "dark (mean 0.26)" },
  { id: "6471912", reason: "close-up and dark" },
  { id: "37554739", reason: "dark (mean 0.21)" },
  { id: "9229815", reason: "dark (32% near-black)" },
  { id: "32208888", reason: "close-up greyscale, low contrast" },
  { id: "37623622", reason: "dark roof close-up" },
  { id: "38510710", reason: "dark close-up" },
  { id: "32427439", reason: "dark-ish portrait (24% near-black, mean 0.30)" },
  { id: "4981772", reason: "over-exposed white wash (mean 0.86, low contrast)" },
];

const TRADE_PATTERNS: Array<[TradeKey, RegExp]> = [
  ["plumbing", /plumb|drain|pipe/i],
  ["roofing", /roof/i],
  ["hvac", /hvac|heating|cooling|air[\s-]?con|furnace/i],
  ["landscaping", /landscap|lawn|garden|tree|yard|mow/i],
  ["cleaning", /clean|maid|janitor|housekeep|pressure[\s-]?wash/i],
  ["electrical", /electric/i],
  ["detailing", /detail|car[\s-]?wash|auto[\s-]?(spa|care)|valet/i],
];

/** Maps a free-text industry to a curated trade, or null when there is none. */
export function tradeKeyFor(industry: string | null | undefined): TradeKey | null {
  const text = (industry ?? "").trim();
  if (!text) return null;
  return TRADE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function pexelsCdnUrl(id: string, width: number): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

export function pexelsPageUrl(id: string): string {
  return `https://www.pexels.com/photo/${id}/`;
}

/** Curated picks that pass the exposure and framing rules for a slot. */
export function picksForTrade(industry: string | null | undefined, slot: PhotoSlot): TradePhotoPick[] {
  const trade = tradeKeyFor(industry);
  if (!trade) return [];
  return TRADE_PHOTO_PICKS.filter(
    (pick) => pick.trade === trade && gradePhotoForSlot({ ...pick.stats, framing: pick.framing }, slot).ok,
  );
}

/** The curated pick as the same shape the free photo library saves. */
export function pickToStockPhoto(pick: TradePhotoPick): StockPhoto {
  const width = 1600;
  return {
    id: pick.id,
    title: pick.alt,
    url: pexelsCdnUrl(pick.id, width),
    thumbnail: pexelsCdnUrl(pick.id, 480),
    provider: "pexels",
    creator: pick.photographer,
    licenseCode: "pexels",
    licenseUrl: "https://www.pexels.com/license/",
    attribution: `Photo by ${pick.photographer} on Pexels`,
    sourcePage: pexelsPageUrl(pick.id),
    width,
    height: Math.round(width / pick.stats.aspect),
  };
}

/** Focal point for a known curated picture, found from its CDN address. */
export function focalForKnownPhoto(url: string | null | undefined): FocalPoint | null {
  if (!url) return null;
  const id = pexelsPhotoId(url);
  if (!id) return null;
  return TRADE_PHOTO_PICKS.find((pick) => pick.id === id)?.focal ?? null;
}
