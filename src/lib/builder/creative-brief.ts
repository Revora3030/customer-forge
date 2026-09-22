/**
 * CREATIVE BRIEF
 * ==============
 *
 * The art-direction layer that runs BEFORE any page rows are written. It turns
 * the design fingerprint, the industry playbook and the chosen visual language
 * into one explicit brief: archetype, personality, type pairing, colour and
 * contrast system, hero composition, photography language, section rhythm,
 * component silhouettes, CTA language, background/atmosphere, motion, mobile
 * strategy and conversion strategy — plus an image inventory with a real brief
 * for every important visual slot.
 *
 * Two hard rules:
 *  - It contains no business claims. Strategy shapes presentation only.
 *  - Generated imagery is tagged AI_GENERATED_MARKETING_VISUAL; only
 *    owner-supplied material may ever be tagged BUSINESS_PROVIDED_EVIDENCE.
 *
 * It is deterministic: the same business always gets the same brief, and the
 * variance pools are wide enough that two firms in one trade do not converge on
 * the same composition.
 */

import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { PlannedShot, VisualDirection } from "@/lib/visual-direction";
import {
  SITE_WIDE_CREATIVE_QUALITY_MATRIX,
  type CreativeQualityMatrix,
} from "@/lib/builder/creative-quality-matrix";

export const AI_GENERATED_MARKETING_VISUAL = "AI_GENERATED_MARKETING_VISUAL" as const;
export const BUSINESS_PROVIDED_EVIDENCE = "BUSINESS_PROVIDED_EVIDENCE" as const;

export type VisualEvidenceTag =
  | typeof AI_GENERATED_MARKETING_VISUAL
  | typeof BUSINESS_PROVIDED_EVIDENCE;

/** Visual archetypes. Chosen per business, never forced on every industry. */
export const VISUAL_ARCHETYPES = [
  "luxury-editorial",
  "premium-automotive",
  "modern-saas",
  "high-end-professional",
  "hospitality-warmth",
  "restaurant-appetite",
  "trade-craft",
  "health-calm",
  "commerce-product",
  "local-trust",
  "creative-studio",
  "industrial-b2b",
] as const;

export type VisualArchetype = (typeof VISUAL_ARCHETYPES)[number];

const ARCHETYPE_KEYWORDS: { archetype: VisualArchetype; words: string[] }[] = [
  { archetype: "premium-automotive", words: ["auto", "car", "detail", "vehicle", "tint", "wrap", "tyre", "tire", "mechanic"] },
  { archetype: "restaurant-appetite", words: ["restaurant", "cafe", "coffee", "bakery", "food", "kitchen", "pizza", "bar", "catering"] },
  { archetype: "hospitality-warmth", words: ["hotel", "resort", "venue", "event", "spa", "retreat", "lodge", "tour"] },
  { archetype: "health-calm", words: ["dental", "dentist", "clinic", "health", "therapy", "wellness", "medical", "chiro", "physio", "salon", "massage"] },
  { archetype: "high-end-professional", words: ["law", "legal", "attorney", "account", "financ", "insur", "consult", "advis", "tax", "architect"] },
  { archetype: "modern-saas", words: ["software", "saas", "app", "platform", "tech", "ai ", "data", "cyber", "it "] },
  { archetype: "commerce-product", words: ["shop", "store", "ecommerce", "retail", "boutique", "product"] },
  { archetype: "creative-studio", words: ["studio", "photograph", "design", "brand", "agency", "video", "marketing", "media"] },
  { archetype: "industrial-b2b", words: ["manufactur", "industrial", "logistics", "fabricat", "wholesale", "equipment", "engineering", "supply"] },
  { archetype: "trade-craft", words: ["roof", "plumb", "electric", "hvac", "landscap", "construct", "remodel", "paint", "clean", "fence", "concrete", "contract"] },
  { archetype: "luxury-editorial", words: ["luxury", "bespoke", "couture", "estate", "jewel", "interior"] },
];

const PERSONALITY_POOL = [
  "confident and understated",
  "warm and reassuring",
  "precise and technical",
  "bold and direct",
  "calm and premium",
  "energetic and modern",
  "editorial and considered",
  "grounded and dependable",
];

const TYPE_PAIRINGS: { id: string; display: string; body: string; character: string }[] = [
  { id: "editorial-serif", display: "high-contrast serif display", body: "neutral grotesque body", character: "editorial authority" },
  { id: "geometric-modern", display: "tight geometric sans display", body: "humanist sans body", character: "modern clarity" },
  { id: "condensed-impact", display: "condensed uppercase display", body: "wide neutral body", character: "physical, hard-working impact" },
  { id: "humanist-warm", display: "soft humanist display", body: "rounded humanist body", character: "welcoming warmth" },
  { id: "technical-mono", display: "grotesque display with monospaced accents", body: "neutral sans body", character: "engineered precision" },
  { id: "luxury-light", display: "light wide serif display", body: "small-caps sans body", character: "quiet luxury" },
];

const HERO_COMPOSITIONS = [
  "full-bleed cinematic image with a left-weighted headline stack",
  "split canvas: oversized type left, tall image right",
  "centred editorial headline over an atmospheric gradient field",
  "layered card over an image, offset to one side",
  "asymmetric grid with a large type anchor and a small supporting frame",
  "wide image band beneath a compact type block",
];

const BACKGROUND_TREATMENTS = [
  "deep base tone with a single soft light bloom",
  "layered gradient field with a fine grain texture",
  "flat premium surface with hairline rule dividers",
  "tonal band alternation between sections",
  "vignetted dark canvas with a low-contrast pattern",
];

const MOTION_LANGUAGE = [
  "short fades with a small upward settle",
  "sequenced reveals down the section order",
  "no entrance motion, hover depth only",
  "parallax-free slow scale on imagery",
];

const CARD_LANGUAGE = [
  "flat bordered panels with generous internal padding",
  "soft-shadow raised cards with a tight radius",
  "edge-to-edge list rows separated by hairlines",
  "glass-tinted panels over the section background",
];

const CTA_LANGUAGE = [
  "solid accent button with a quiet ghost secondary",
  "wide pill primary with an underlined text secondary",
  "square-edged high-contrast primary with an icon affordance",
  "bordered primary that fills on hover, plain-text secondary",
];

const SECTION_RHYTHM = [
  "tall opener, tight proof, wide services, generous close",
  "even cadence with one deliberately oversized feature section",
  "compressed above the fold, expanding down the page",
  "alternating tall and short bands with a full-width break",
];

export type TypographySpec = {
  pairingId: string;
  display: string;
  body: string;
  character: string;
  /** Ratio between consecutive type steps. */
  scaleRatio: number;
  headlineWeight: "light" | "regular" | "medium" | "bold";
  headlineCase: "sentence" | "title" | "upper";
  measureCh: number;
};

export type ColorSpec = {
  system: string;
  strategy: "dark-dominant" | "light-dominant" | "duotone" | "tonal";
  accentUse: string;
  minBodyContrast: number;
  minLargeTextContrast: number;
};

export type ImageBriefSpec = {
  slot: string;
  label: string;
  purpose: string;
  subject: string;
  environment: string;
  action: string;
  lighting: string;
  camera: string;
  framing: string;
  focalPoint: "left" | "right" | "centre" | "lower-third";
  negativeSpace: "left" | "right" | "top" | "bottom";
  aspectRatio: PlannedShot["aspect"];
  palette: string;
  mood: string;
  section: string[];
  mobileCrop: string;
  constraints: string[];
  evidenceTag: VisualEvidenceTag;
};

export type CreativeBrief = {
  version: 1;
  archetype: VisualArchetype;
  personality: string;
  fingerprintId: string;
  typography: TypographySpec;
  color: ColorSpec;
  heroComposition: string;
  photography: {
    language: string;
    lighting: string;
    environment: string;
    treatment: string;
    subjects: string[];
  };
  sectionRhythm: string;
  density: DesignFingerprint["density"];
  cardLanguage: string;
  ctaLanguage: string;
  backgroundTreatment: string;
  shapeLanguage: { radius: string; border: string; shadow: string };
  motion: { level: DesignFingerprint["motionLevel"]; language: string };
  mobileStrategy: string[];
  conversionStrategy: string[];
  industryConventions: string[];
  imageInventory: ImageBriefSpec[];
  /** Shared acceptance bar applied across every page, not only the home page. */
  qualityMatrix: CreativeQualityMatrix;
  /** Everything the brief refuses to invent. */
  prohibitedEvidence: string[];
};

export const PROHIBITED_EVIDENCE = [
  "google reviews",
  "testimonials",
  "awards",
  "certifications",
  "licences",
  "before/after results",
  "customer logos",
  "statistics",
  "claims of completed work",
];

function pick<T>(pool: readonly T[], seed: number, offset: number): T {
  const index = Math.abs(Math.floor(seed / 7 + offset * 31)) % pool.length;
  return pool[index]!;
}

export function pickArchetype(signals: string): VisualArchetype {
  const text = ` ${signals.toLowerCase()} `;
  for (const entry of ARCHETYPE_KEYWORDS) {
    if (entry.words.some((word) => text.includes(word))) return entry.archetype;
  }
  return "local-trust";
}

const CONVENTIONS: Record<VisualArchetype, string[]> = {
  "luxury-editorial": ["restrained palette", "oversized editorial type", "wide margins"],
  "premium-automotive": ["deep reflective surfaces", "macro detail crops", "dark canvas"],
  "modern-saas": ["product-forward framing", "clear feature grid", "crisp light UI surfaces"],
  "high-end-professional": ["authoritative typography", "measured spacing", "credential-led structure"],
  "hospitality-warmth": ["atmospheric interiors", "warm light", "invitation-led calls to action"],
  "restaurant-appetite": ["close food framing", "warm shadows", "menu and booking prominence"],
  "trade-craft": ["work-in-progress imagery", "strong service grid", "call-now prominence"],
  "health-calm": ["clean bright rooms", "soft contrast", "reassurance before pricing"],
  "commerce-product": ["consistent product framing", "clear price and buy paths", "tight grid"],
  "local-trust": ["real place cues", "service area clarity", "fast contact paths"],
  "creative-studio": ["portfolio-first layout", "asymmetric grid", "bold type moments"],
  "industrial-b2b": ["scale and capability imagery", "specification clarity", "quote-led conversion"],
};

const MOBILE_STRATEGY: Record<DesignFingerprint["density"], string[]> = {
  compact: [
    "single column with tight 20px gutters",
    "headline capped to three lines at 320px",
    "primary action visible without scrolling",
  ],
  balanced: [
    "single column with 24px gutters",
    "hero image cropped to its focal point",
    "sticky contact action after the first section",
  ],
  airy: [
    "single column with 28px gutters and taller section padding",
    "hero type allowed to breathe, image below the fold",
    "one action per screen",
  ],
};

export function compileCreativeBrief(input: {
  fingerprint: DesignFingerprint;
  direction: VisualDirection;
  shots: PlannedShot[];
  industryLabel: string;
  industrySignals: string;
  primaryCta: string;
  secondaryCta: string;
  conversionPlacements: string[];
  stickyMobile: boolean;
  hasOwnerPhotos: boolean;
}): CreativeBrief {
  const seed = input.fingerprint.seed;
  const archetype = pickArchetype(`${input.industrySignals} ${input.industryLabel}`);
  const pairing = pick(TYPE_PAIRINGS, seed, 1);
  const darkFamilies = /luxury|automotive|industrial|creative/;

  const brief: CreativeBrief = {
    version: 1,
    archetype,
    personality: pick(PERSONALITY_POOL, seed, 2),
    fingerprintId: input.fingerprint.id,
    typography: {
      pairingId: pairing.id,
      display: pairing.display,
      body: pairing.body,
      character: pairing.character,
      scaleRatio: [1.2, 1.25, 1.333, 1.414][Math.abs(seed) % 4]!,
      headlineWeight: (["light", "regular", "medium", "bold"] as const)[Math.abs(seed >> 2) % 4]!,
      headlineCase: (["sentence", "title", "upper"] as const)[Math.abs(seed >> 3) % 3]!,
      measureCh: 58 + (Math.abs(seed >> 4) % 4) * 4,
    },
    color: {
      system: input.fingerprint.colorSystem,
      strategy: darkFamilies.test(archetype)
        ? "dark-dominant"
        : (["light-dominant", "duotone", "tonal"] as const)[Math.abs(seed >> 5) % 3]!,
      accentUse: "accent reserved for one primary action and one type highlight per screen",
      minBodyContrast: 4.5,
      minLargeTextContrast: 3,
    },
    heroComposition: pick(HERO_COMPOSITIONS, seed, 3),
    photography: {
      language: input.direction.language,
      lighting: input.direction.lighting,
      environment: input.direction.environment,
      treatment: input.direction.treatment,
      subjects: input.direction.subjects.slice(0, 4),
    },
    sectionRhythm: pick(SECTION_RHYTHM, seed, 4),
    density: input.fingerprint.density,
    cardLanguage: pick(CARD_LANGUAGE, seed, 5),
    ctaLanguage: pick(CTA_LANGUAGE, seed, 6),
    backgroundTreatment: pick(BACKGROUND_TREATMENTS, seed, 7),
    shapeLanguage: {
      radius: (["0px", "4px", "10px", "18px"] as const)[Math.abs(seed >> 6) % 4]!,
      border: (["hairline 1px", "none", "2px structural"] as const)[Math.abs(seed >> 7) % 3]!,
      shadow: (["none", "soft ambient", "tight contact"] as const)[Math.abs(seed >> 8) % 3]!,
    },
    motion: {
      level: input.fingerprint.motionLevel,
      language:
        input.fingerprint.motionLevel === "none"
          ? "no entrance motion, hover depth only"
          : pick(MOTION_LANGUAGE, seed, 8),
    },
    mobileStrategy: [
      ...MOBILE_STRATEGY[input.fingerprint.density],
      ...(input.stickyMobile ? ["persistent mobile action bar"] : []),
    ],
    conversionStrategy: [
      `primary action: ${input.primaryCta}`,
      `secondary action: ${input.secondaryCta}`,
      ...input.conversionPlacements.slice(0, 5).map((place) => `action placement: ${place}`),
    ],
    industryConventions: CONVENTIONS[archetype],
    imageInventory: [],
    qualityMatrix: SITE_WIDE_CREATIVE_QUALITY_MATRIX,
    prohibitedEvidence: [...PROHIBITED_EVIDENCE],
  };

  brief.imageInventory = input.shots.map((shot, index) =>
    imageBriefFor(shot, brief, input.direction, index, input.hasOwnerPhotos),
  );
  return brief;
}

const FOCALS = ["left", "right", "centre", "lower-third"] as const;
const SPACES = ["right", "left", "bottom", "top"] as const;

function imageBriefFor(
  shot: PlannedShot,
  brief: CreativeBrief,
  direction: VisualDirection,
  index: number,
  hasOwnerPhotos: boolean,
): ImageBriefSpec {
  const focal = FOCALS[(Math.abs(brief.typography.measureCh) + index) % FOCALS.length]!;
  const space = SPACES[(index + brief.imageInventory.length + 1) % SPACES.length]!;
  const isBackground = shot.slot === "background";
  return {
    slot: shot.slot,
    label: shot.label,
    purpose: shot.purpose,
    subject: isBackground
      ? "an abstract brand-toned surface or texture, no people, no objects"
      : (shot.subjectHint ?? direction.subjects[index % direction.subjects.length] ?? direction.subjects[0]!),
    environment: direction.environment,
    action: isBackground ? "static surface" : "work being carried out calmly and competently",
    lighting: direction.lighting,
    camera:
      shot.slot === "hero"
        ? "wide 24-35mm feel, low grain, shallow-but-readable depth"
        : shot.slot === "service"
          ? "50-85mm feel with close, honest detail"
          : "neutral 35mm feel",
    framing: `${shot.aspect} frame, ${focal} focal weight, clear ${space} negative space for type`,
    focalPoint: focal,
    negativeSpace: space,
    aspectRatio: shot.aspect,
    palette: "brand accents present in the scene only, no colour overlay",
    mood: brief.personality,
    section: [...shot.placement],
    mobileCrop: `must stay readable cropped to a 4:5 ${focal} crop at 320px`,
    constraints: [
      "no text",
      "no logos",
      "no watermarks",
      "no readable signage",
      "no recognisable real people or brands",
      "never presented as proof of completed work, reviews, awards or results",
    ],
    // This function briefs generated starter imagery. Existing owner photos may
    // guide which slots remain open, but they never change generated media into
    // business-provided evidence.
    evidenceTag: AI_GENERATED_MARKETING_VISUAL,
  };
}

/**
 * Anti-convergence check: two briefs for different businesses in the same trade
 * must differ across several structural axes, not just colour and copy.
 */
export function briefDivergence(a: CreativeBrief, b: CreativeBrief): number {
  const axes: (keyof CreativeBrief)[] = [
    "heroComposition",
    "sectionRhythm",
    "cardLanguage",
    "ctaLanguage",
    "backgroundTreatment",
    "personality",
  ];
  let differences = axes.filter((axis) => a[axis] !== b[axis]).length;
  if (a.typography.pairingId !== b.typography.pairingId) differences += 1;
  if (a.shapeLanguage.radius !== b.shapeLanguage.radius) differences += 1;
  return differences;
}
