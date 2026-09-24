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

/**
 * Maps the large creative vocabulary onto the finite treatments implemented by
 * the public renderer. The source choice is still retained in the fingerprint;
 * this is only its visual rendering contract.
 */
export function rendererVariant(kind: string, source: string): string {
  const token = safeToken(source);
  if (kind === "hero") {
    if (/layer|overlap|collage|floating|inset|card/.test(token)) return "hero-layered";
    if (/editorial|magazine|columns|portrait|frame/.test(token)) return "hero-editorial";
    if (/spotlight|poster|statement|type-first|quiet|centered/.test(token)) return "hero-focus";
    return "hero-split";
  }
  if (kind === "services") {
    if (/elevated|shadow|hover-lift|floating|gradient/.test(token)) return "cards-floating";
    if (/editorial|media-side|wide-feature|rule|columns/.test(token)) return "cards-editorial";
    if (/sharp|minimal|flat|compact|rows/.test(token)) return "cards-clean";
    return "cards-elevated";
  }
  if (kind === "reviews") {
    if (/single|spotlight|banner|metric/.test(token)) return "proof-feature";
    if (/editorial|pullquote|rows|list/.test(token)) return "proof-editorial";
    if (/grid|columns|wall|grouped/.test(token)) return "proof-grid";
    return "proof-cards";
  }
  if (kind === "gallery") {
    if (/mosaic|quilt|staggered|offset/.test(token)) return "gallery-mosaic";
    if (/full-bleed|filmstrip|feature|rail/.test(token)) return "gallery-cinematic";
    if (/captioned|framed|duotone|category/.test(token)) return "gallery-editorial";
    return "gallery-grid";
  }
  if (kind === "faq") {
    if (/compact|accordion|rows/.test(token)) return "faq-compact";
    if (/grid|grouped|boxed|tabbed|sidebar/.test(token)) return "faq-editorial";
    if (/wide|open|spacious/.test(token)) return "faq-spacious";
    return "faq-clean";
  }
  if (kind === "pricing") {
    if (/matrix|compare|table/.test(token)) return "pricing-matrix";
    if (/tier|package|bundle|columns/.test(token)) return "pricing-cards";
    if (/highlight|callout|offer/.test(token)) return "pricing-feature";
    return "pricing-rows";
  }
  if (kind === "stats") {
    if (/big-number|large|counter|contrast/.test(token)) return "stats-statement";
    if (/band|strip|row|columns/.test(token)) return "stats-band";
    if (/proof|split|sidebar/.test(token)) return "stats-editorial";
    return "stats-grid";
  }
  if (kind === "process") {
    if (/horizontal|rail|arrow|progress/.test(token)) return "process-rail";
    if (/vertical|story|zigzag|annotated/.test(token)) return "process-story";
    if (/phase|tab|before-during/.test(token)) return "process-phases";
    return "process-steps";
  }
  if (kind === "quote" || kind === "booking" || kind === "contact") {
    if (/glass|boxed|card|contrast/.test(token)) return "form-glass";
    if (/split|sidebar|map|editorial/.test(token)) return "form-editorial";
    if (/stepped|wizard|calendar|premium/.test(token)) return "form-premium";
    return "form-clean";
  }
  if (kind === "cta" || kind === "offer") {
    if (/full-bleed|band|footer-merge/.test(token)) return "cta-fullbleed";
    if (/spotlight|stat|testimonial|urgency/.test(token)) return "cta-spotlight";
    if (/card|panel|boxed|frame/.test(token)) return "cta-panel";
    return "cta-minimal";
  }
  if (/editorial|split|sidebar|columns|zigzag/.test(token)) return "section-editorial";
  if (/wide|band|masonry|carousel|metric/.test(token)) return "section-airy";
  if (/inset|bordered|card|tab/.test(token)) return "section-soft";
  return "section-balanced";
}

/** Finite public-renderer classes for the site-wide identity. */
export function fingerprintClassNames(fingerprint: DesignFingerprint): string {
  return [
    "rv-site",
    `rv-family-${safeToken(fingerprint.family)}`,
    `rv-shell-${safeToken(fingerprint.pageShell)}`,
    `rv-nav-${safeToken(fingerprint.navSystem)}`,
    `rv-footer-${safeToken(fingerprint.footerSystem)}`,
    `rv-background-${safeToken(fingerprint.backgroundSystem)}`,
    `rv-type-${safeToken(fingerprint.typeSystem)}`,
    `rv-motion-${safeToken(fingerprint.motionPattern)}`,
    `rv-transition-${safeToken(fingerprint.sectionTransition)}`,
    `rv-density-site-${safeToken(fingerprint.density)}`,
  ].join(" ");
}
