/**
 * Screenshot reference fingerprinting.
 *
 * A reference screenshot can influence layout, hierarchy, spacing, type feel,
 * colour mood and interaction language, but it must never copy brand assets,
 * wording, logos, exact colours or claims. This module accepts only bounded
 * structured observations and maps them into Revora's finite design vocabulary.
 */
import {
  BACKGROUND_SYSTEMS,
  CARD_SYSTEMS,
  COLOR_SYSTEMS,
  CTA_SYSTEMS,
  DESIGN_FAMILIES,
  FOOTER_SYSTEMS,
  GALLERY_LAYOUTS,
  HERO_COMPOSITIONS,
  IMAGE_TREATMENTS,
  MOTION_PATTERNS,
  NAV_SYSTEMS,
  PAGE_SHELLS,
  PROOF_LAYOUTS,
  SECTION_COMPOSITIONS,
  SECTION_TRANSITIONS,
  STATS_LAYOUTS,
  TIMELINE_LAYOUTS,
  TYPE_SYSTEMS,
  type DesignFingerprint,
} from "@/lib/builder/design-fingerprint";
import type { CreativeBrief } from "@/lib/builder/creative-brief";

export type ScreenshotReferenceObservation = {
  layout?: unknown;
  hierarchy?: unknown;
  typography?: unknown;
  spacing?: unknown;
  color?: unknown;
  interactions?: unknown;
  components?: unknown;
};

export type NormalizedScreenshotReferenceObservation = {
  layout: string[];
  hierarchy: string[];
  typography: string[];
  spacing: string[];
  color: string[];
  interactions: string[];
  components: string[];
};

export type ScreenshotReferenceBrief = {
  version: 1;
  applied: boolean;
  fingerprint: DesignFingerprint;
  signals: {
    layout: string[];
    hierarchy: string[];
    typography: string[];
    spacing: string[];
    color: string[];
    interactions: string[];
  };
  antiCloning: {
    copiedTextAllowed: false;
    copiedAssetsAllowed: false;
    copiedBrandAllowed: false;
    excluded: string[];
  };
  warnings: string[];
};

type SignalKey = keyof ScreenshotReferenceBrief["signals"];

type Patch = Partial<
  Pick<
    DesignFingerprint,
    | "family"
    | "heroComposition"
    | "backgroundSystem"
    | "sectionRhythm"
    | "navSystem"
    | "ctaSystem"
    | "cardSystem"
    | "proofLayout"
    | "galleryLayout"
    | "statsLayout"
    | "timelineLayout"
    | "footerSystem"
    | "decorativeSystem"
    | "typeSystem"
    | "colorSystem"
    | "sectionTransition"
    | "pageShell"
    | "imageTreatment"
    | "motionPattern"
    | "motionLevel"
    | "density"
  >
>;

const SIGNAL_KEYS: SignalKey[] = [
  "layout",
  "hierarchy",
  "typography",
  "spacing",
  "color",
  "interactions",
];

const OBSERVATION_KEYS = [...SIGNAL_KEYS, "components"] as const;

const CLONING_WORDS = /\b(logo|brand name|trademark|watermark|exact copy|verbatim|same text|same wording|clone|identical|pixel perfect|copy the|steal|screenshot text)\b/i;
const URL_OR_EMAIL = /(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+)/i;
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/i;

const asList = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
};

const cleanSignal = (value: string, blocked: string[]): string | null => {
  if (URL_OR_EMAIL.test(value) || HEX_COLOUR.test(value) || CLONING_WORDS.test(value)) return null;
  let text = value.replace(URL_OR_EMAIL, "").replace(HEX_COLOUR, "").trim().toLowerCase();
  for (const word of blocked) {
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped) text = text.replace(new RegExp(escaped, "ig"), "").trim();
  }
  if (!text || CLONING_WORDS.test(text)) return null;
  return text.slice(0, 80);
};

const includes = (text: string, words: string[]) => words.some((word) => text.includes(word));

function addSignal(
  signals: ScreenshotReferenceBrief["signals"],
  key: SignalKey,
  value: string,
) {
  const list = signals[key];
  if (!list.includes(value)) list.push(value);
}

function pickReferencePatch(text: string): Patch {
  const patch: Patch = {};

  if (includes(text, ["split", "two column", "side by side"])) {
    patch.heroComposition = "split-left";
    patch.pageShell = "split-screen";
    patch.sectionRhythm = "two-column";
  } else if (includes(text, ["editorial", "magazine", "serif", "publication"])) {
    patch.family = "luxury-editorial";
    patch.heroComposition = "editorial-columns";
    patch.pageShell = "magazine-columns";
    patch.sectionRhythm = "alternating";
  } else if (includes(text, ["bento", "grid", "tile", "dashboard"])) {
    patch.heroComposition = "grid-inset";
    patch.pageShell = "grid-shell";
    patch.sectionRhythm = "feature-grid";
    patch.cardSystem = "outlined";
  } else if (includes(text, ["full bleed", "immersive", "cinematic", "poster"])) {
    patch.family = "cinematic";
    patch.heroComposition = "full-bleed-overlay";
    patch.pageShell = "full-width";
    patch.imageTreatment = "gradient-overlay";
  } else if (includes(text, ["minimal", "quiet", "simple", "white space"])) {
    patch.family = "premium-minimal";
    patch.heroComposition = "quiet-minimal";
    patch.backgroundSystem = "quiet-canvas";
    patch.cardSystem = "minimal-rule";
  }

  if (includes(text, ["large headline", "oversized", "bold type", "statement"])) {
    patch.heroComposition = patch.heroComposition ?? "wide-statement";
    patch.typeSystem = "wide-display";
  }
  if (includes(text, ["condensed", "compressed type"])) patch.typeSystem = "condensed-impact";
  else if (includes(text, ["mono", "technical", "code"])) patch.typeSystem = "technical-mono-accent";
  else if (includes(text, ["serif", "editorial"])) patch.typeSystem = "editorial-serif";
  else if (includes(text, ["geometric", "modern sans"])) patch.typeSystem = "geometric-sans";

  if (includes(text, ["dark", "black", "charcoal"])) patch.colorSystem = "dark-ink";
  if (includes(text, ["gold", "brass", "luxury"])) patch.colorSystem = "ivory-gold";
  if (includes(text, ["teal", "aqua", "cyan"])) patch.colorSystem = "midnight-teal";
  if (includes(text, ["lime", "green accent"])) patch.colorSystem = "graphite-lime";
  if (includes(text, ["light", "white", "clean", "paper"])) patch.colorSystem = "light-neutral";

  if (includes(text, ["airy", "spacious", "wide spacing", "breathing"])) patch.density = "airy";
  else if (includes(text, ["compact", "dense", "tight"])) patch.density = "compact";

  if (includes(text, ["pill", "rounded"])) {
    patch.cardSystem = "pill";
    patch.ctaSystem = "inline-pair";
  } else if (includes(text, ["glass", "frosted", "translucent"])) {
    patch.cardSystem = "glass";
    patch.backgroundSystem = "glass-panels";
  } else if (includes(text, ["sharp", "square", "hard edge"])) {
    patch.cardSystem = "sharp";
    patch.sectionTransition = "hard-edge";
  }

  if (includes(text, ["sticky", "floating nav", "fixed nav"])) patch.navSystem = "sticky-condensed";
  if (includes(text, ["mobile bottom", "bottom bar"])) patch.ctaSystem = "sticky-bar";
  if (includes(text, ["form", "lead", "quote"])) patch.ctaSystem = "split-form";

  if (includes(text, ["fade"])) patch.motionPattern = "fade-in-sections";
  else if (includes(text, ["parallax"])) patch.motionPattern = "soft-parallax";
  else if (includes(text, ["hover", "lift"])) patch.motionPattern = "hover-lift";
  if (includes(text, ["animation", "motion", "parallax", "hover"])) patch.motionLevel = "subtle";
  if (includes(text, ["no animation", "static"])) {
    patch.motionPattern = "none";
    patch.motionLevel = "none";
  }

  if (includes(text, ["masonry", "collage"])) patch.galleryLayout = "masonry";
  if (includes(text, ["testimonial", "quote"])) patch.proofLayout = "single-spotlight";
  if (includes(text, ["timeline", "steps", "process"])) patch.timelineLayout = "numbered-steps";
  if (includes(text, ["footer", "sitemap"])) patch.footerSystem = "sitemap-wide";

  return patch;
}

function boundedObservations(
  observations: unknown,
  blocked: string[],
): { signals: ScreenshotReferenceBrief["signals"]; warnings: string[]; text: string } {
  const signals: ScreenshotReferenceBrief["signals"] = {
    layout: [],
    hierarchy: [],
    typography: [],
    spacing: [],
    color: [],
    interactions: [],
  };
  const warnings: string[] = [];
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) {
    warnings.push("No structured screenshot observations were available, so the original design fingerprint was kept.");
    return { signals, warnings, text: "" };
  }

  const raw = observations as ScreenshotReferenceObservation;
  for (const key of SIGNAL_KEYS) {
    for (const item of asList(raw[key])) {
      if (CLONING_WORDS.test(item) || URL_OR_EMAIL.test(item) || HEX_COLOUR.test(item)) {
        warnings.push(`${key} contained copy-like or exact asset detail and was ignored.`);
      }
      const cleaned = cleanSignal(item, blocked);
      if (cleaned) addSignal(signals, key, cleaned);
    }
  }
  for (const item of asList(raw.components)) {
    const cleaned = cleanSignal(item, blocked);
    if (cleaned) addSignal(signals, "layout", cleaned);
  }
  const text = SIGNAL_KEYS.flatMap((key) => signals[key]).join(" ");
  return { signals, warnings, text };
}

export function normalizeScreenshotReferenceObservations(
  observations: unknown,
  input: { businessName?: string | null; blockedNames?: string[]; maxPerField?: number } = {},
): NormalizedScreenshotReferenceObservation {
  const blocked = [input.businessName ?? "", ...(input.blockedNames ?? [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const maxPerField = Math.max(1, Math.min(input.maxPerField ?? 6, 8));
  const normal: NormalizedScreenshotReferenceObservation = {
    layout: [],
    hierarchy: [],
    typography: [],
    spacing: [],
    color: [],
    interactions: [],
    components: [],
  };
  if (!observations || typeof observations !== "object" || Array.isArray(observations)) return normal;
  const raw = observations as ScreenshotReferenceObservation;
  for (const key of OBSERVATION_KEYS) {
    for (const item of asList(raw[key])) {
      const cleaned = cleanSignal(item, blocked);
      if (cleaned && !normal[key].includes(cleaned)) normal[key].push(cleaned);
      if (normal[key].length >= maxPerField) break;
    }
  }
  return normal;
}

function allowedPatch(patch: Patch): Patch {
  const out: Patch = {};
  const allow = <K extends keyof Patch>(key: K, pool: readonly string[]) => {
    const value = patch[key];
    if (typeof value === "string" && pool.includes(value)) out[key] = value as Patch[K];
  };
  allow("family", DESIGN_FAMILIES);
  allow("heroComposition", HERO_COMPOSITIONS);
  allow("backgroundSystem", BACKGROUND_SYSTEMS);
  allow("sectionRhythm", SECTION_COMPOSITIONS);
  allow("navSystem", NAV_SYSTEMS);
  allow("ctaSystem", CTA_SYSTEMS);
  allow("cardSystem", CARD_SYSTEMS);
  allow("proofLayout", PROOF_LAYOUTS);
  allow("galleryLayout", GALLERY_LAYOUTS);
  allow("statsLayout", STATS_LAYOUTS);
  allow("timelineLayout", TIMELINE_LAYOUTS);
  allow("footerSystem", FOOTER_SYSTEMS);
  allow("typeSystem", TYPE_SYSTEMS);
  allow("colorSystem", COLOR_SYSTEMS);
  allow("sectionTransition", SECTION_TRANSITIONS);
  allow("pageShell", PAGE_SHELLS);
  allow("imageTreatment", IMAGE_TREATMENTS);
  allow("motionPattern", MOTION_PATTERNS);
  if (patch.motionLevel === "none" || patch.motionLevel === "subtle" || patch.motionLevel === "expressive")
    out.motionLevel = patch.motionLevel;
  if (patch.density === "compact" || patch.density === "balanced" || patch.density === "airy")
    out.density = patch.density;
  return out;
}

export function alignCreativeBriefToFingerprint(
  brief: CreativeBrief,
  fingerprint: DesignFingerprint,
): CreativeBrief {
  return {
    ...brief,
    fingerprintId: fingerprint.id,
    density: fingerprint.density,
    heroComposition: fingerprint.heroComposition,
    sectionRhythm: fingerprint.sectionRhythm,
    cardLanguage: `${fingerprint.cardSystem} card system`,
    ctaLanguage: `${fingerprint.ctaSystem} call-to-action system`,
    backgroundTreatment: `${fingerprint.backgroundSystem} background system`,
    color: { ...brief.color, system: fingerprint.colorSystem },
    motion: {
      ...brief.motion,
      level: fingerprint.motionLevel,
      language: fingerprint.motionPattern === "none" ? "no entrance motion, hover depth only" : `${fingerprint.motionPattern} motion`,
    },
    imageInventory: brief.imageInventory.map((item) => ({
      ...item,
      palette: fingerprint.colorSystem,
      mood: fingerprint.family,
      framing: `${item.aspectRatio} frame aligned to the ${fingerprint.heroComposition} composition`,
    })),
  };
}

export function deriveScreenshotReferenceFingerprint(input: {
  observations: unknown;
  base: DesignFingerprint;
  businessName?: string | null;
  blockedNames?: string[];
}): ScreenshotReferenceBrief {
  const blocked = [input.businessName ?? "", ...(input.blockedNames ?? [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const { signals, warnings, text } = boundedObservations(input.observations, blocked);
  const patch = allowedPatch(pickReferencePatch(text));
  const applied = Object.keys(patch).length > 0;
  const fingerprint = applied ? { ...input.base, ...patch } : input.base;
  return {
    version: 1,
    applied,
    fingerprint,
    signals,
    antiCloning: {
      copiedTextAllowed: false,
      copiedAssetsAllowed: false,
      copiedBrandAllowed: false,
      excluded: [
        "logos",
        "brand names",
        "exact copy",
        "exact colours",
        "exact coordinates",
        "watermarks",
        "recognisable proprietary assets",
        "business claims from the reference",
      ],
    },
    warnings: warnings.slice(0, 8),
  };
}

export function applyScreenshotReferenceToCreative<
  T extends { fingerprint: DesignFingerprint; brief: CreativeBrief },
>(input: {
  creative: T;
  observations: unknown;
  businessName?: string | null;
  blockedNames?: string[];
}): { creative: T; reference: ScreenshotReferenceBrief } {
  const reference = deriveScreenshotReferenceFingerprint({
    observations: input.observations,
    base: input.creative.fingerprint,
    ...(input.businessName === undefined ? {} : { businessName: input.businessName }),
    ...(input.blockedNames === undefined ? {} : { blockedNames: input.blockedNames }),
  });
  if (!reference.applied) return { creative: input.creative, reference };
  return {
    creative: {
      ...input.creative,
      fingerprint: reference.fingerprint,
      brief: alignCreativeBriefToFingerprint(input.creative.brief, reference.fingerprint),
    } as T,
    reference,
  };
}
