/**
 * SAVED DESIGN RECORD (read-only data contract)
 * =============================================
 *
 * The design record the AI design team authored for a website, as stored in
 * website_settings.generation.designFingerprint. This module only reads,
 * writes and renders that stored record. It contains no style pools, no
 * seeded picking and no mapping that decides a layout: every value in the
 * record was written by the AI (or, for sites built before the migration,
 * was saved long ago and is displayed exactly as stored).
 *
 * It contains no business facts and no copy.
 */

export type DesignFingerprint = {
  /** Stable id for this identity — safe to show in admin/proof reports. */
  id: string;
  seed: number;
  /** The overall design family this website belongs to (luxury, technical, ...). */
  family: string;
  heroComposition: string;
  backgroundSystem: string;
  sectionRhythm: string;
  navSystem: string;
  ctaSystem: string;
  cardSystem: string;
  proofLayout: string;
  pricingLayout: string;
  faqLayout: string;
  galleryLayout: string;
  statsLayout: string;
  timelineLayout: string;
  formLayout: string;
  footerSystem: string;
  decorativeSystem: string;
  typeSystem: string;
  colorSystem: string;
  /** How one section meets the next. */
  sectionTransition: string;
  /** Page-level shell/frame composition. */
  pageShell: string;
  /** How imagery is treated when real photography exists. */
  imageTreatment: string;
  /** The specific motion pattern used, within the motion level below. */
  motionPattern: string;
  motionLevel: "none" | "subtle" | "expressive";
  density: "compact" | "balanced" | "airy";
  /** Art direction for imagery — never invents what the photo depicts. */
  artDirection: {
    style: string;
    subject: string;
    crop: string;
    focalPoint: string;
    aspectRatio: "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
    overlay: string;
  };
  /** Styles the owner has rejected — never re-offered. */
  rejected: string[];
  updatedAt?: string;
};

/**
 * A blank record for a site with nothing saved yet. It carries no design
 * opinion — the renderer shows plain, unstyled output until the AI writes the
 * real record. It is never presented to the AI as a look to keep.
 */
export function blankDesignFingerprint(): DesignFingerprint {
  return {
    id: "fp_neutral",
    seed: 0,
    family: "neutral",
    heroComposition: "centered-stack",
    backgroundSystem: "flat",
    sectionRhythm: "stacked",
    navSystem: "simple-left",
    ctaSystem: "inline-pair",
    cardSystem: "flat-tinted",
    proofLayout: "stacked",
    pricingLayout: "stacked",
    faqLayout: "stacked",
    galleryLayout: "grid",
    statsLayout: "row",
    timelineLayout: "stacked",
    formLayout: "stacked",
    footerSystem: "simple",
    decorativeSystem: "none",
    typeSystem: "neutral",
    colorSystem: "neutral",
    sectionTransition: "none",
    pageShell: "full-width",
    imageTreatment: "plain",
    motionPattern: "none",
    motionLevel: "none",
    density: "balanced",
    artDirection: {
      style: "plain",
      subject: "abstract generated artwork (depicts nothing about the business)",
      crop: "centered",
      focalPoint: "center",
      aspectRatio: "16:9",
      overlay: "none",
    },
    rejected: [],
  };
}

/* ------------------------------------------------------- persistence + brief */

/** Reads a stored fingerprint out of the website's generation settings blob. */
export function readDesignFingerprint(generation: unknown): DesignFingerprint | null {
  const blob = (generation ?? {}) as Record<string, unknown>;
  const raw = blob["designFingerprint"];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value["id"] !== "string" || typeof value["seed"] !== "number") return null;
  return value as unknown as DesignFingerprint;
}

/** Merges the fingerprint into the generation blob without touching other keys. */
export function writeDesignFingerprint(
  generation: unknown,
  fingerprint: DesignFingerprint,
): Record<string, unknown> {
  const blob = (generation && typeof generation === "object" ? { ...(generation as Record<string, unknown>) } : {});
  blob["designFingerprint"] = { ...fingerprint, updatedAt: new Date().toISOString() };
  return blob;
}

/** Records a style the owner rejected, so it is never selected again. */
export function rejectStyle(fingerprint: DesignFingerprint, style: string): DesignFingerprint {
  const clean = style.trim().toLowerCase();
  if (!clean || fingerprint.rejected.includes(clean)) return fingerprint;
  return { ...fingerprint, rejected: [...fingerprint.rejected, clean].slice(0, 24) };
}

/** One compact message the planner reads so the look stays consistent. */
/** Tells the AI which look it authored earlier, so later edits stay consistent. */
export function fingerprintBrief(fingerprint: DesignFingerprint): string {
  return [
    "Design identity already established for this website. Keep it consistent unless this request asks to change it:",
    `- Design family: ${fingerprint.family}; page shell: ${fingerprint.pageShell}`,
    `- Hero composition: ${fingerprint.heroComposition}`,
    `- Background system: ${fingerprint.backgroundSystem}`,
    `- Section rhythm: ${fingerprint.sectionRhythm}; section transition: ${fingerprint.sectionTransition}`,
    `- Navigation: ${fingerprint.navSystem}; CTA: ${fingerprint.ctaSystem}; Cards: ${fingerprint.cardSystem}`,
    `- Proof: ${fingerprint.proofLayout}; Pricing: ${fingerprint.pricingLayout}; FAQ: ${fingerprint.faqLayout}`,
    `- Gallery: ${fingerprint.galleryLayout}; Stats: ${fingerprint.statsLayout}; Process: ${fingerprint.timelineLayout}; Forms: ${fingerprint.formLayout}; Footer: ${fingerprint.footerSystem}`,
    `- Decoration: ${fingerprint.decorativeSystem}; Type: ${fingerprint.typeSystem}; Colour: ${fingerprint.colorSystem}`,
    `- Motion: ${fingerprint.motionLevel} (${fingerprint.motionPattern}); Density: ${fingerprint.density}; Image treatment: ${fingerprint.imageTreatment}`,
    `- Art direction: ${fingerprint.artDirection.style}, ${fingerprint.artDirection.crop} crop, ${fingerprint.artDirection.overlay} overlay, ${fingerprint.artDirection.aspectRatio}`,
    fingerprint.rejected.length ? `- Never use again (owner rejected): ${fingerprint.rejected.join(", ")}` : "",
    "This identity describes design only. It is never a source of business facts, prices, reviews or claims.",
  ].filter(Boolean).join("\n");
}

const safeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
