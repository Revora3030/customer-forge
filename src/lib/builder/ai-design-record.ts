/**
 * AI DESIGN RECORD (read-only data contract)
 * =============================================
 *
 * The open-ended design record the AI design team authored for a website, as stored in
 * website_settings.generation.aiDesignRecord. This module only reads,
 * writes and renders that stored record. It contains no style pools, no
 * random or seeded picking and no mapping that decides a layout: every value in the
 * record was written by the AI (or, for sites built before the migration,
 * was saved long ago and is displayed exactly as stored).
 *
 * It contains no business facts and no copy.
 */

export type AiDesignRecord = {
  /** Stable id for this identity — safe to show in admin/proof reports. */
  id: string;
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
  /** Free-form motion intensity token written by the AI; safety is enforced at render time. */
  motionLevel: string;
  /** Free-form density token written by the AI. */
  density: string;
  /** Art direction for imagery — never invents what the photo depicts. */
  artDirection: {
    style: string;
    subject: string;
    crop: string;
    focalPoint: string;
    aspectRatio: "" | "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
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
export function blankAiDesignRecord(): AiDesignRecord {
  return {
    id: "",
    family: "",
    heroComposition: "",
    backgroundSystem: "",
    sectionRhythm: "",
    navSystem: "",
    ctaSystem: "",
    cardSystem: "",
    proofLayout: "",
    pricingLayout: "",
    faqLayout: "",
    galleryLayout: "",
    statsLayout: "",
    timelineLayout: "",
    formLayout: "",
    footerSystem: "",
    decorativeSystem: "",
    typeSystem: "",
    colorSystem: "",
    sectionTransition: "",
    pageShell: "",
    imageTreatment: "",
    motionPattern: "",
    motionLevel: "",
    density: "",
    artDirection: {
      style: "",
      subject: "",
      crop: "",
      focalPoint: "",
      aspectRatio: "",
      overlay: "",
    },
    rejected: [],
  };
}

/* ------------------------------------------------------- persistence + brief */

/** Reads a stored record out of the website's generation settings blob. */
export function readAiDesignRecord(generation: unknown): AiDesignRecord | null {
  const blob = (generation ?? {}) as Record<string, unknown>;
  const raw = blob["aiDesignRecord"];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value["id"] !== "string") return null;
  return value as unknown as AiDesignRecord;
}

/** True only when the saved record contains an AI-authored look. */
export function hasAuthoredAiDesignRecord(record: AiDesignRecord | null): record is AiDesignRecord {
  return Boolean(record?.family.trim()) && record?.family !== "neutral";
}

/** Merges the record into the generation blob without touching other keys. */
export function writeAiDesignRecord(
  generation: unknown,
  record: AiDesignRecord,
): Record<string, unknown> {
  const blob = (generation && typeof generation === "object" ? { ...(generation as Record<string, unknown>) } : {});
  blob["aiDesignRecord"] = { ...record, updatedAt: new Date().toISOString() };
  return blob;
}

/** Records a style the owner rejected, so it is never selected again. */
export function rejectDesignStyle(record: AiDesignRecord, style: string): AiDesignRecord {
  const clean = style.trim().toLowerCase();
  if (!clean || record.rejected.includes(clean)) return record;
  return { ...record, rejected: [...record.rejected, clean].slice(0, 24) };
}

/** One compact message the planner reads so the look stays consistent. */
/** Tells the AI which look it authored earlier, so later edits stay consistent. */
export function aiDesignRecordBrief(record: AiDesignRecord): string {
  return [
    "Design identity already established for this website. Keep it consistent unless this request asks to change it:",
    `- Design family: ${record.family}; page shell: ${record.pageShell}`,
    `- Hero composition: ${record.heroComposition}`,
    `- Background system: ${record.backgroundSystem}`,
    `- Section rhythm: ${record.sectionRhythm}; section transition: ${record.sectionTransition}`,
    `- Navigation: ${record.navSystem}; CTA: ${record.ctaSystem}; Cards: ${record.cardSystem}`,
    `- Proof: ${record.proofLayout}; Pricing: ${record.pricingLayout}; FAQ: ${record.faqLayout}`,
    `- Gallery: ${record.galleryLayout}; Stats: ${record.statsLayout}; Process: ${record.timelineLayout}; Forms: ${record.formLayout}; Footer: ${record.footerSystem}`,
    `- Decoration: ${record.decorativeSystem}; Type: ${record.typeSystem}; Colour: ${record.colorSystem}`,
    `- Motion: ${record.motionLevel} (${record.motionPattern}); Density: ${record.density}; Image treatment: ${record.imageTreatment}`,
    `- Art direction: ${record.artDirection.style}, ${record.artDirection.crop} crop, ${record.artDirection.overlay} overlay, ${record.artDirection.aspectRatio}`,
    record.rejected.length ? `- Never use again (owner rejected): ${record.rejected.join(", ")}` : "",
    "This identity describes design only. It is never a source of business facts, prices, reviews or claims.",
  ].filter(Boolean).join("\n");
}

