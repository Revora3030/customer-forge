/**
 * Design fingerprint system.
 *
 * A vocabulary of design families, compositions, and systems that the AI team
 * uses to describe a site's visual identity. Values are string-based to allow
 * the AI to express nuanced design directions while keeping the structure fixed.
 */

export type DesignFamily = string;
export type HeroComposition = string;
export type BackgroundSystem = string;
export type CardSystem = string;
export type ColorSystem = string;
export type CtaSystem = string;
export type NavSystem = string;
export type PageShell = string;
export type SectionComposition = string;
export type SectionTransition = string;
export type ImageTreatment = string;
export type MotionPattern = string;
export type TypeSystem = string;
export type GalleryLayout = string;
export type ProofLayout = string;
export type StatsLayout = string;
export type TimelineLayout = string;
export type FooterSystem = string;

export type DesignFingerprint = {
  id?: string;
  family: DesignFamily;
  heroComposition: HeroComposition;
  backgroundSystem: BackgroundSystem;
  cardSystem: CardSystem;
  colorSystem: ColorSystem;
  ctaSystem: CtaSystem;
  navSystem: NavSystem;
  pageShell: PageShell;
  sectionComposition: SectionComposition;
  sectionTransition: SectionTransition;
  imageTreatment: ImageTreatment;
  motionPattern: MotionPattern;
  typeSystem: TypeSystem;
  galleryLayout: GalleryLayout;
  proofLayout: ProofLayout;
  statsLayout: StatsLayout;
  timelineLayout: TimelineLayout;
  footerSystem: FooterSystem;
  density?: string;
  sectionRhythm?: string;
  motionLevel?: string;
  decorativeSystem?: string;
};

// Reference values for iteration (non-exhaustive)
export const DESIGN_FAMILIES: DesignFamily[] = [
  "premium-minimal", "luxury-editorial", "cinematic", "bold-creative", "warm-organic", "technical-precise",
];
export const HERO_COMPOSITIONS: HeroComposition[] = [
  "wide-statement", "split-left", "split-right", "editorial-columns", "grid-inset", "full-bleed-overlay", "quiet-minimal", "centered-stack",
];
export const BACKGROUND_SYSTEMS: BackgroundSystem[] = ["quiet-canvas", "gradient-wash", "textured-surface", "full-bleed-image"];
export const CARD_SYSTEMS: CardSystem[] = ["outlined", "elevated", "minimal-rule", "borderless"];
export const COLOR_SYSTEMS: ColorSystem[] = ["warm-neutral", "cool-slate", "vibrant-accent", "monochrome"];
export const CTA_SYSTEMS: CtaSystem[] = ["solid-pill", "outlined", "ghost-link", "gradient"];
export const NAV_SYSTEMS: NavSystem[] = ["sticky-bar", "overlay", "minimal", "split"];
export const PAGE_SHELLS: PageShell[] = ["split-screen", "magazine-columns", "grid-shell", "full-width", "centered"];
export const SECTION_COMPOSITIONS: SectionComposition[] = ["stack", "alternating", "grid", "masonry", "carousel"];
export const SECTION_TRANSITIONS: SectionTransition[] = ["fade", "slide", "scale", "none"];
export const IMAGE_TREATMENTS: ImageTreatment[] = ["gradient-overlay", "duotone", "full-color", "sepia", "blur-bg"];
export const MOTION_PATTERNS: MotionPattern[] = ["subtle-rise", "parallax", "ken-burns", "reveal", "none"];
export const TYPE_SYSTEMS: TypeSystem[] = ["wide-display", "condensed-impact", "technical-mono-accent", "editorial-serif", "clean-sans"];
export const GALLERY_LAYOUTS: GalleryLayout[] = ["grid-3", "grid-4", "masonry", "slider", "justified"];
export const PROOF_LAYOUTS: ProofLayout[] = ["logos", "testimonials", "stats", "badges"];
export const STATS_LAYOUTS: StatsLayout[] = ["row", "grid-2", "grid-4", "hero-number"];
export const TIMELINE_LAYOUTS: TimelineLayout[] = ["vertical", "horizontal", "zigzag"];
export const FOOTER_SYSTEMS: FooterSystem[] = ["minimal", "expanded", "cta-band", "newsletter"];

export function createDesignFingerprint(input: {
  businessName: string;
  industry: string;
  city: string;
  photoCount: number;
}): DesignFingerprint {
  const isLuxury = /spa|salon|jewel|luxury|boutique|fine/i.test(input.industry);
  const isAuto = /auto|detail|car|mechanic|garage/i.test(input.industry);
  const isTech = /tech|software|it|cyber|dev/i.test(input.industry);
  const isHealth = /dental|medical|clinic|health|therapy/i.test(input.industry);
  const isFood = /restaurant|cafe|bakery|catering|food/i.test(input.industry);

  if (isLuxury) return {
    family: "luxury-editorial", heroComposition: "editorial-columns", backgroundSystem: "quiet-canvas",
    cardSystem: "minimal-rule", colorSystem: "warm-neutral", ctaSystem: "outlined", navSystem: "minimal",
    pageShell: "magazine-columns", sectionComposition: "alternating", sectionTransition: "fade",
    imageTreatment: "full-color", motionPattern: "subtle-rise", typeSystem: "editorial-serif",
    galleryLayout: "masonry", proofLayout: "testimonials", statsLayout: "row", timelineLayout: "vertical",
    footerSystem: "minimal",
  };
  if (isAuto) return {
    family: "cinematic", heroComposition: "full-bleed-overlay", backgroundSystem: "full-bleed-image",
    cardSystem: "elevated", colorSystem: "vibrant-accent", ctaSystem: "solid-pill", navSystem: "sticky-bar",
    pageShell: "full-width", sectionComposition: "grid", sectionTransition: "scale",
    imageTreatment: "gradient-overlay", motionPattern: "parallax", typeSystem: "wide-display",
    galleryLayout: "grid-4", proofLayout: "stats", statsLayout: "grid-4", timelineLayout: "horizontal",
    footerSystem: "expanded",
  };
  if (isTech) return {
    family: "technical-precise", heroComposition: "split-left", backgroundSystem: "quiet-canvas",
    cardSystem: "outlined", colorSystem: "cool-slate", ctaSystem: "solid-pill", navSystem: "sticky-bar",
    pageShell: "grid-shell", sectionComposition: "grid", sectionTransition: "fade",
    imageTreatment: "full-color", motionPattern: "subtle-rise", typeSystem: "clean-sans",
    galleryLayout: "grid-3", proofLayout: "logos", statsLayout: "grid-4", timelineLayout: "vertical",
    footerSystem: "expanded",
  };
  if (isHealth) return {
    family: "warm-organic", heroComposition: "centered-stack", backgroundSystem: "gradient-wash",
    cardSystem: "elevated", colorSystem: "warm-neutral", ctaSystem: "solid-pill", navSystem: "sticky-bar",
    pageShell: "centered", sectionComposition: "stack", sectionTransition: "fade",
    imageTreatment: "full-color", motionPattern: "reveal", typeSystem: "clean-sans",
    galleryLayout: "grid-3", proofLayout: "testimonials", statsLayout: "row", timelineLayout: "vertical",
    footerSystem: "cta-band",
  };
  if (isFood) return {
    family: "warm-organic", heroComposition: "full-bleed-overlay", backgroundSystem: "textured-surface",
    cardSystem: "borderless", colorSystem: "warm-neutral", ctaSystem: "solid-pill", navSystem: "overlay",
    pageShell: "full-width", sectionComposition: "masonry", sectionTransition: "fade",
    imageTreatment: "full-color", motionPattern: "ken-burns", typeSystem: "editorial-serif",
    galleryLayout: "masonry", proofLayout: "testimonials", statsLayout: "hero-number", timelineLayout: "vertical",
    footerSystem: "newsletter",
  };
  return {
    family: "premium-minimal", heroComposition: "wide-statement", backgroundSystem: "quiet-canvas",
    cardSystem: "outlined", colorSystem: "warm-neutral", ctaSystem: "solid-pill", navSystem: "sticky-bar",
    pageShell: "centered", sectionComposition: "stack", sectionTransition: "fade",
    imageTreatment: "full-color", motionPattern: "subtle-rise", typeSystem: "clean-sans",
    galleryLayout: "grid-3", proofLayout: "stats", statsLayout: "grid-2", timelineLayout: "vertical",
    footerSystem: "minimal",
  };
}

export function sectionDesignFromFingerprint(
  kindOrFingerprint: string | DesignFingerprint | null,
  fingerprint?: DesignFingerprint | null,
  index?: number,
): Record<string, unknown> | null {
  const fp = typeof kindOrFingerprint === "string" ? fingerprint : kindOrFingerprint;
  if (!fp) return null;
  return {
    layout: fp.sectionComposition ?? fp.heroComposition,
    cardStyle: fp.cardSystem,
    imageTreatment: fp.imageTreatment,
    maxWidth: fp.pageShell === "full-width" ? "none" : "default",
    family: fp.family,
    heroComposition: fp.heroComposition,
    colorSystem: fp.colorSystem,
    typeSystem: fp.typeSystem,
    motionPattern: fp.motionPattern,
    galleryLayout: fp.galleryLayout,
  };
}

export function blankDesignFingerprint(): DesignFingerprint | null {
  return null;
}

/** A neutral fingerprint used when no design direction has been chosen. */
export function neutralDesignFingerprint(): DesignFingerprint {
  return {
    family: "premium-minimal",
    heroComposition: "wide-statement",
    backgroundSystem: "quiet-canvas",
    cardSystem: "outlined",
    colorSystem: "warm-neutral",
    ctaSystem: "solid-pill",
    navSystem: "sticky-bar",
    pageShell: "centered",
    sectionComposition: "stack",
    sectionTransition: "fade",
    imageTreatment: "full-color",
    motionPattern: "subtle-rise",
    typeSystem: "clean-sans",
    galleryLayout: "grid-3",
    proofLayout: "stats",
    statsLayout: "grid-2",
    timelineLayout: "vertical",
    footerSystem: "minimal",
  };
}

/** Reads a design fingerprint from a settings object, or null if absent. */
export function readDesignFingerprint(settings: unknown): DesignFingerprint | null {
  if (!settings || typeof settings !== "object") return null;
  const obj = settings as Record<string, unknown>;
  if (!obj["family"] || typeof obj["family"] !== "string") return null;
  return obj as unknown as DesignFingerprint;
}
