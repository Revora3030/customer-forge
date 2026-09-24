/**
 * FIRST-BUILD CONTRACT (data only)
 * ================================
 *
 * The container a first build carries from intake to publish. It is built from
 * the owner's facts only and starts with every design field BLANK. Sol writes
 * the look, the brief and the picture direction into it; Terra reviews. Nothing
 * in here picks a style, an archetype, a type pairing, a palette, a layout or
 * a photo style. There are no pools and no seeded choices.
 *
 * Safety-only content that stays: evidence tags for images, the list of things
 * a brief may never invent, the owner's unknown facts, and the quality bar.
 */
import { businessDna } from "@/lib/business-dna";
import {
  blankDesignFingerprint,
  type DesignFingerprint,
} from "@/lib/builder/design-fingerprint";
import { planShots, type PlannedShot } from "@/lib/visual-direction";
import { assetPlanFor, type AssetPlan } from "@/lib/builder/asset-intelligence";
import {
  SITE_WIDE_CREATIVE_QUALITY_MATRIX,
  type CreativeQualityMatrix,
} from "@/lib/builder/creative-quality-matrix";

export const AI_GENERATED_MARKETING_VISUAL = "AI_GENERATED_MARKETING_VISUAL" as const;
export const BUSINESS_PROVIDED_EVIDENCE = "BUSINESS_PROVIDED_EVIDENCE" as const;
export type VisualEvidenceTag =
  | typeof AI_GENERATED_MARKETING_VISUAL
  | typeof BUSINESS_PROVIDED_EVIDENCE;

/** Things no brief may ever invent. Safety list, not a style. */
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

export type TypographySpec = {
  pairingId: string;
  display: string;
  body: string;
  character: string;
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
  /** Free text written by the AI. Empty until it does. */
  archetype: string;
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
  qualityMatrix: CreativeQualityMatrix;
  prohibitedEvidence: string[];
};

export type FirstBuildCreativeInput = {
  organizationId: string;
  businessName: string;
  industry: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  yearsInBusiness: number | null;
  services: { name: string; price?: number | null; starting_price?: number | null }[];
  goals: string[];
  conversionGoal: string | null;
  photoCount: number;
  hasHeroImage?: boolean;
  testimonialCount: number;
  bookableServices: number;
  hasHours: boolean;
};

export type FirstBuildCreativeDirection = {
  version: 1;
  industry: {
    id: string;
    /** The owner's own words for their industry. */
    label: string;
    objections: string[];
    trust: string[];
    avoid: string[];
  };
  audience: string;
  offerHierarchy: string[];
  conversion: {
    goal: string;
    primaryCta: string;
    secondaryCta: string;
    placements: string[];
    stickyMobile: boolean;
  };
  fingerprint: DesignFingerprint;
  imagery: {
    directionId: string;
    language: string;
    treatment: string;
    status: "owner_photos" | "artwork_only";
    shots: PlannedShot[];
    assetPlan: AssetPlan;
  };
  brief: CreativeBrief;
  unknowns: string[];
  /** Cleaned, anti-cloning screenshot observations handed to Sol as inspiration. */
  referenceSignals?: Record<string, string[]> | null;
};

const IMAGE_CONSTRAINTS = [
  "no text",
  "no logos",
  "no watermarks",
  "no readable signage",
  "no recognisable real people or brands",
  "never presented as proof of completed work, reviews, awards or results",
];

/** A slot's safety envelope. Every look-related field is left for the AI. */
function blankImageBrief(shot: PlannedShot): ImageBriefSpec {
  return {
    slot: shot.slot,
    label: shot.label,
    purpose: shot.purpose,
    subject: shot.subjectHint ?? "",
    environment: "",
    action: "",
    lighting: "",
    camera: "",
    framing: `${shot.aspect} frame`,
    focalPoint: "centre",
    negativeSpace: "right",
    aspectRatio: shot.aspect,
    palette: "",
    mood: "",
    section: [...shot.placement],
    mobileCrop: "must stay readable at 320px",
    constraints: [...IMAGE_CONSTRAINTS],
    evidenceTag: AI_GENERATED_MARKETING_VISUAL,
  };
}

export function blankCreativeBrief(
  fingerprint: DesignFingerprint,
  shots: PlannedShot[],
  primaryCta: string,
  secondaryCta: string,
): CreativeBrief {
  return {
    version: 1,
    archetype: "",
    personality: "",
    fingerprintId: fingerprint.id,
    typography: {
      pairingId: "",
      display: "",
      body: "",
      character: "",
      scaleRatio: 1.25,
      headlineWeight: "regular",
      headlineCase: "sentence",
      measureCh: 65,
    },
    color: {
      system: "",
      strategy: "tonal",
      accentUse: "",
      // Accessibility minimums — safety, not style.
      minBodyContrast: 4.5,
      minLargeTextContrast: 3,
    },
    heroComposition: "",
    photography: { language: "", lighting: "", environment: "", treatment: "", subjects: [] },
    sectionRhythm: "",
    density: fingerprint.density,
    cardLanguage: "",
    ctaLanguage: "",
    backgroundTreatment: "",
    shapeLanguage: { radius: "", border: "", shadow: "" },
    motion: { level: fingerprint.motionLevel, language: "" },
    mobileStrategy: [],
    conversionStrategy: [`primary action: ${primaryCta}`, `secondary action: ${secondaryCta}`],
    industryConventions: [],
    imageInventory: shots.map(blankImageBrief),
    qualityMatrix: SITE_WIDE_CREATIVE_QUALITY_MATRIX,
    prohibitedEvidence: [...PROHIBITED_EVIDENCE],
  };
}

const slug = (value: string | null) =>
  (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "business";

/**
 * Builds the blank first-build container from facts only. Every design and
 * art-direction field is empty for Sol to author.
 */
export function blankFirstBuildDirection(input: FirstBuildCreativeInput): FirstBuildCreativeDirection {
  const serviceNames = input.services.map((service) => service.name).filter(Boolean);
  const hasPrices = input.services.some(
    (service) => service.price != null || service.starting_price != null,
  );
  const dna = businessDna({
    businessName: input.businessName,
    industry: input.industry,
    services: serviceNames,
    description: input.description,
    city: input.city,
    region: input.state,
    serviceArea: input.serviceArea,
    phone: input.phone,
    email: input.email,
    yearsInBusiness: input.yearsInBusiness,
    testimonialCount: input.testimonialCount,
    photoCount: input.photoCount,
    hasPrices,
    bookableServices: input.bookableServices,
    goals: input.goals,
    conversionGoal: input.conversionGoal,
    hasHours: input.hasHours,
  });
  const fingerprint: DesignFingerprint = {
    ...blankDesignFingerprint(),
    id: `fp_${slug(input.organizationId).slice(0, 24)}`,
  };
  const shots = planShots({
    direction: null,
    serviceNames,
    hasHeroImage: input.hasHeroImage === true,
    mediaCount: input.photoCount,
  });
  const assetPlan = assetPlanFor(
    { businessName: input.businessName, logoUrl: null, heroImageUrl: null },
    ["hero"],
    { hasHeroImage: input.hasHeroImage === true, galleryPhotoCount: input.photoCount },
  );
  return {
    version: 1,
    industry: {
      id: slug(input.industry),
      label: input.industry ?? "",
      objections: [],
      trust: [],
      avoid: [...dna.prohibited],
    },
    audience: dna.targetCustomer,
    offerHierarchy: serviceNames.slice(0, 12),
    conversion: {
      goal: dna.desiredAction,
      primaryCta: dna.primaryCta,
      secondaryCta: dna.secondaryCta,
      placements: [],
      stickyMobile: false,
    },
    fingerprint,
    imagery: {
      directionId: "",
      language: "",
      treatment: "",
      status: input.photoCount > 0 ? "owner_photos" : "artwork_only",
      shots,
      assetPlan,
    },
    brief: blankCreativeBrief(fingerprint, shots, dna.primaryCta, dna.secondaryCta),
    unknowns: dna.needed,
  };
}
