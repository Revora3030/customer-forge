/**
 * DESIGN FINGERPRINT
 * ==================
 *
 * A website's visual identity, derived once from what the business actually is
 * and then reused on every later request so the look does not drift.
 *
 * Why this exists: the builder used to re-decide the look from scratch on each
 * request, so two businesses in the same trade could land on the same layout,
 * and the same business could quietly change character between turns. The
 * fingerprint fixes both: it is deterministic (same business in, same identity
 * out) and it is wide (the selection pools are large enough that two firms in
 * one industry still differ).
 *
 * It contains no business facts and no copy — only design choices. Nothing in
 * here is ever shown to a visitor as a claim about the business.
 */

export type FingerprintInput = {
  businessName: string | null;
  industry: string | null;
  city: string | null;
  audience?: string | null;
  goal?: string | null;
  /** How many real photos the owner has supplied. Drives art direction. */
  photoCount?: number;
  /** How much written content exists — drives density and rhythm. */
  contentDensity?: "light" | "balanced" | "rich";
  /** Bump to deliberately re-roll the identity. */
  revision?: number;
};

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

/* ------------------------------------------------------------------ pools */

export const HERO_COMPOSITIONS = [
  "split-left", "split-right", "centered-stack", "offset-overlap", "full-bleed-overlay",
  "editorial-columns", "card-on-canvas", "diagonal-split", "framed-panel", "stacked-proof",
  "wide-statement", "asymmetric-thirds", "media-band", "floating-panel", "boxed-contrast",
  "type-first", "grid-inset", "layered-depth", "ribbon-band", "quiet-minimal",
  "poster", "magazine-lede", "spotlight", "collage", "bordered-frame",
  "corner-accent", "stepped-columns", "tall-portrait", "banner-strip", "duotone-panel",
  "arch-frame", "marquee-lede",
] as const;

export const BACKGROUND_SYSTEMS = [
  "flat", "soft-wash", "mesh-bloom", "linear-fade", "radial-glow", "dual-tone",
  "grain", "fine-grid", "dot-field", "topographic", "contour-lines", "ribbon-waves",
  "concentric-rings", "terrazzo", "blueprint", "diagonal-stripes", "halftone",
  "arc-stack", "blob-drift", "prism", "glass-panels", "paper", "tint-band",
  "vignette", "spotlit", "mosaic", "hatched", "sunburst", "layered-fades",
  "edge-glow", "quiet-canvas", "cross-hatch",
] as const;

export const SECTION_COMPOSITIONS = [
  "stacked", "two-column", "three-column", "alternating", "zigzag", "sidebar-left",
  "sidebar-right", "wide-band", "inset-card", "bordered-rows", "numbered-steps",
  "feature-grid", "masonry", "carousel-rail", "split-media", "quote-break",
  "table-rows", "accordion-stack", "tab-panels", "timeline", "comparison-columns",
  "metric-band", "mosaic-grid", "checklist-pair", "spotlight-row",
] as const;

export const NAV_SYSTEMS = [
  "simple-left", "centered-logo", "split-actions", "pill-bar", "underline-tabs",
  "bordered-bar", "transparent-overlay", "sticky-condensed", "two-row", "mega-panel",
  "drawer-mobile", "sheet-mobile", "bottom-actions", "icon-compact", "contrast-bar",
  "floating-capsule", "inline-phone", "cta-emphasis", "quiet-minimal", "boxed-logo",
  "rail-vertical", "hours-strip", "search-lead", "breadcrumb-bar", "segmented-tabs",
] as const;

export const CTA_SYSTEMS = [
  "band-solid", "band-tinted", "card-centered", "split-form", "sticky-bar",
  "inline-pair", "panel-offset", "full-bleed", "bordered-frame", "gradient-band",
  "quote-lead", "phone-first", "booking-first", "checklist-cta", "two-step",
  "testimonial-backed", "urgency-strip", "quiet-link", "boxed-contrast", "footer-merge",
  "map-side", "faq-adjacent", "stat-backed", "dual-audience", "callback-request",
] as const;

export const CARD_SYSTEMS = [
  "soft", "sharp", "pill", "outlined", "elevated", "flat-tinted", "glass",
  "bordered-top", "numbered", "icon-lead", "media-top", "media-side", "split-tone",
  "hover-lift", "hover-tint", "minimal-rule", "stacked-rows", "compact-list",
  "wide-feature", "badge-corner", "ruled-columns", "gradient-edge", "inset-shadow",
  "monoline-icon", "tall-portrait",
] as const;

export const PROOF_LAYOUTS = [
  "quote-grid", "quote-rail", "single-spotlight", "stacked-quotes", "rating-band",
  "avatar-row", "logo-wall", "quote-with-metric", "columns-two", "columns-three",
  "bordered-rows", "card-carousel", "editorial-pullquote", "compact-list", "mixed-proof",
  "quote-over-media", "rating-with-list", "sidebar-quotes", "banner-quote", "grouped-by-service",
] as const;

export const PRICING_LAYOUTS = [
  "three-tier", "two-tier", "single-offer", "table-compare", "list-rows",
  "feature-matrix", "starting-from", "package-cards", "estimator-lead", "tier-highlight",
  "inline-band", "bordered-columns", "stacked-mobile", "toggle-interval", "quote-only",
  "per-service-rows", "bundle-pair", "range-band", "callout-plus-list", "contact-for-quote",
] as const;

export const FAQ_LAYOUTS = [
  "accordion", "two-column-accordion", "open-list", "grouped", "bordered-rows",
  "card-grid", "sidebar-nav", "numbered", "compact", "split-intro",
  "inline-cta", "search-lead", "tabbed", "quiet-list", "wide-rows",
  "two-column-open", "question-first", "topic-chips", "boxed-contrast", "footer-adjacent",
] as const;

export const GALLERY_LAYOUTS = [
  "grid-3", "grid-4", "masonry", "rail", "before-after", "mosaic", "full-bleed-strip",
  "framed-grid", "duotone-grid", "captioned", "lightbox-grid", "staggered",
  "single-feature", "two-up", "compact-thumbs", "filmstrip", "quilt", "offset-pairs",
  "wide-feature-plus-thumbs", "category-tabs",
] as const;

export const STATS_LAYOUTS = [
  "band-four", "band-three", "card-grid", "inline-row", "bordered-columns",
  "big-number", "icon-pair", "stacked-rows", "split-with-copy", "ring-set",
  "bar-set", "compact-strip", "contrast-band", "quiet-list", "metric-with-proof",
  "two-up-large", "counter-band", "table-figures", "sidebar-metrics", "footer-strip",
] as const;

export const TIMELINE_LAYOUTS = [
  "vertical-line", "horizontal-rail", "numbered-steps", "stepped-cards", "zigzag-path",
  "milestone-band", "process-columns", "arrow-flow", "checklist-steps", "phase-tabs",
  "compact-list", "two-column-steps", "calendar-band", "day-plan", "before-during-after",
  "icon-path", "progress-bar", "annotated-rail", "quarter-grid", "story-scroll",
] as const;

export const FORM_LAYOUTS = [
  "single-column", "two-column", "card-panel", "split-with-copy", "inline-band",
  "stepped", "sidebar-contact", "boxed-contrast", "minimal-rows", "phone-first",
  "booking-calendar", "quote-wizard", "compact", "full-width", "footer-embedded",
  "map-side", "service-picker-lead", "callback-slot", "upload-supported", "two-step-confirm",
] as const;

export const FOOTER_SYSTEMS = [
  "simple-center", "three-column", "four-column", "split-cta", "contrast-band",
  "compact-bar", "sitemap-wide", "logo-lead", "hours-panel", "area-list",
  "newsletter-lead", "phone-emphasis", "bordered-top", "stacked-mobile", "quiet-minimal",
  "map-embedded", "two-tier", "credential-row", "service-links", "dark-band",
] as const;

export const DECORATIVE_SYSTEMS = [
  "none", "soft-blobs", "arc-set", "ring-set", "dot-grid", "line-rays", "wave-band",
  "corner-shapes", "floating-tiles", "contour-drift", "prism-shards", "grid-fade",
  "halo", "stacked-bars", "orbit",
] as const;

export const TYPE_SYSTEMS = [
  "display-grotesque", "editorial-serif", "humanist-sans", "geometric-sans",
  "condensed-impact", "literary-serif", "technical-mono-accent", "rounded-friendly",
  "high-contrast-didone", "neutral-swiss", "warm-slab", "modern-variable",
  "grotesque-with-serif-lede", "wide-display", "compact-ui-sans", "elegant-oldstyle",
  "industrial-stencil-accent", "soft-geometric", "newsprint-serif", "mono-display",
] as const;

export const COLOR_SYSTEMS = [
  "light-neutral", "light-tinted", "warm-cream", "cool-paper", "dark-charcoal",
  "dark-ink", "high-contrast", "duotone", "muted-earth", "vivid-accent",
  "monochrome-accent", "pastel-calm", "deep-forest", "clay-warm", "slate-cool",
  "ivory-gold", "midnight-teal", "sand-terracotta", "graphite-lime", "plum-quiet",
] as const;

export const DESIGN_FAMILIES = [
  "luxury-editorial", "premium-minimal", "cinematic", "bold-statement", "glass-modern",
  "organic-soft", "startup-bright", "technical-precise", "warm-local", "hospitality-inviting",
  "professional-high-trust", "industrial-robust", "wellness-calm", "creative-expressive",
  "futuristic", "playful", "elegant-classic", "dark-focused", "light-airy", "documentary-honest",
] as const;

export const MOTION_PATTERNS = [
  "none", "fade-in-sections", "rise-on-scroll", "stagger-cards", "soft-parallax",
  "hover-lift", "underline-sweep", "counter-count-up", "image-zoom-slow", "border-draw",
  "sticky-reveal", "gradient-drift", "cursor-accent", "marquee-band", "step-highlight",
] as const;

export const IMAGE_TREATMENTS = [
  "plain", "rounded-soft", "sharp-edge", "framed-border", "duotone", "warm-grade",
  "cool-grade", "high-contrast", "desaturated", "gradient-overlay", "arch-mask",
  "inset-shadow", "offset-outline", "split-tone", "grain-overlay",
] as const;

export const SECTION_TRANSITIONS = [
  "hard-edge", "hairline-rule", "tone-shift", "soft-fade", "curve-top",
  "angled-cut", "wave-edge", "overlap-card", "inset-notch", "shadow-lift",
  "band-divider", "double-rule", "arc-cut", "stepped-edge", "quiet-gap",
] as const;

export const PAGE_SHELLS = [
  "full-width", "boxed-centered", "wide-with-gutters", "framed-canvas", "rail-sidebar",
  "sticky-aside", "split-screen", "magazine-columns", "narrow-reading", "hero-overlap",
  "floating-header", "grid-shell", "bordered-page", "panelled", "continuous-scroll",
] as const;

const ART_STYLES = [
  "documentary", "editorial", "clean-studio", "lifestyle", "environmental",
  "detail-macro", "candid", "architectural", "product-forward", "portrait-led",
] as const;

const ART_CROPS = ["wide", "tight", "portrait", "square", "panoramic"] as const;
const ART_OVERLAYS = ["none", "soft-dark", "soft-light", "gradient-bottom", "tint", "duotone"] as const;
const FOCAL_POINTS = ["0.5 0.5", "0.4 0.4", "0.6 0.45", "0.5 0.35", "0.35 0.5"] as const;
const RATIOS = ["16:9", "4:3", "3:2", "1:1", "21:9"] as const;

/* ------------------------------------------------------------------- seed */

/** Stable 32-bit hash. Same input always gives the same identity. */
export function fingerprintSeed(input: FingerprintInput): number {
  const key = [
    (input.businessName ?? "").trim().toLowerCase(),
    (input.industry ?? "").trim().toLowerCase(),
    (input.city ?? "").trim().toLowerCase(),
    (input.audience ?? "").trim().toLowerCase(),
    (input.goal ?? "").trim().toLowerCase(),
    String(input.revision ?? 0),
  ].join("|");
  let out = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    out ^= key.charCodeAt(i);
    out = Math.imul(out, 16777619) >>> 0;
  }
  return out >>> 0;
}

function pick<T>(pool: readonly T[], seed: number, salt: string, rejected: Set<string>): T {
  let cursor = seed;
  for (let i = 0; i < salt.length; i += 1) {
    cursor ^= salt.charCodeAt(i);
    cursor = Math.imul(cursor, 16777619) >>> 0;
  }
  for (let attempt = 0; attempt < pool.length; attempt += 1) {
    const value = pool[(cursor + attempt * 7) % pool.length] as T;
    if (!rejected.has(String(value))) return value;
  }
  return pool[cursor % pool.length] as T;
}

/**
 * Builds the identity. Deterministic for a given business, and wide enough that
 * two businesses in the same industry receive materially different sites.
 */
export function createDesignFingerprint(
  input: FingerprintInput,
  rejected: string[] = [],
): DesignFingerprint {
  const seed = fingerprintSeed(input);
  const blocked = new Set(rejected.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const photos = Math.max(0, input.photoCount ?? 0);
  const densityHint = input.contentDensity ?? "balanced";

  // With no real photography, lean on decorative artwork instead of empty frames.
  const decorativePool = photos >= 4
    ? DECORATIVE_SYSTEMS
    : DECORATIVE_SYSTEMS.filter((system) => system !== "none");
  // First builds can receive safe generated marketing imagery after this
  // fingerprint is compiled. Do not permanently remove cinematic/media-led
  // compositions merely because the owner has not uploaded a photo yet.
  const heroPool = HERO_COMPOSITIONS;

  const motionRoll = (seed >>> 5) % 10;
  const motionLevel: DesignFingerprint["motionLevel"] =
    motionRoll < 2 ? "none" : motionRoll < 8 ? "subtle" : "expressive";

  const density: DesignFingerprint["density"] =
    densityHint === "rich" ? "compact" : densityHint === "light" ? "airy" : ((seed >>> 9) % 3 === 0 ? "airy" : "balanced");

  const motionPattern = motionLevel === "none"
    ? "none"
    : pick(MOTION_PATTERNS.filter((pattern) => pattern !== "none"), seed, "motion", blocked);

  return {
    id: `fp_${seed.toString(36)}`,
    seed,
    family: pick(DESIGN_FAMILIES, seed, "family", blocked),
    heroComposition: pick(heroPool, seed, "hero", blocked),
    backgroundSystem: pick(BACKGROUND_SYSTEMS, seed, "background", blocked),
    sectionRhythm: pick(SECTION_COMPOSITIONS, seed, "section", blocked),
    navSystem: pick(NAV_SYSTEMS, seed, "nav", blocked),
    ctaSystem: pick(CTA_SYSTEMS, seed, "cta", blocked),
    cardSystem: pick(CARD_SYSTEMS, seed, "card", blocked),
    proofLayout: pick(PROOF_LAYOUTS, seed, "proof", blocked),
    pricingLayout: pick(PRICING_LAYOUTS, seed, "pricing", blocked),
    faqLayout: pick(FAQ_LAYOUTS, seed, "faq", blocked),
    galleryLayout: pick(GALLERY_LAYOUTS, seed, "gallery", blocked),
    statsLayout: pick(STATS_LAYOUTS, seed, "stats", blocked),
    timelineLayout: pick(TIMELINE_LAYOUTS, seed, "timeline", blocked),
    formLayout: pick(FORM_LAYOUTS, seed, "form", blocked),
    footerSystem: pick(FOOTER_SYSTEMS, seed, "footer", blocked),
    decorativeSystem: pick(decorativePool, seed, "decor", blocked),
    typeSystem: pick(TYPE_SYSTEMS, seed, "type", blocked),
    colorSystem: pick(COLOR_SYSTEMS, seed, "color", blocked),
    sectionTransition: pick(SECTION_TRANSITIONS, seed, "transition", blocked),
    pageShell: pick(PAGE_SHELLS, seed, "shell", blocked),
    imageTreatment: photos > 0 ? pick(IMAGE_TREATMENTS, seed, "imagetreat", blocked) : "plain",
    motionPattern,
    motionLevel,
    density,
    artDirection: {
      style: pick(ART_STYLES, seed, "artstyle", blocked),
      subject: photos > 0 ? "the owner's own supplied photographs" : "abstract generated artwork (depicts nothing about the business)",
      crop: pick(ART_CROPS, seed, "crop", blocked),
      focalPoint: pick(FOCAL_POINTS, seed, "focal", blocked),
      aspectRatio: pick(RATIOS, seed, "ratio", blocked),
      overlay: pick(ART_OVERLAYS, seed, "overlay", blocked),
    },
    rejected: [...blocked],
  };
}

/**
 * The look used when a website has no design recorded yet: deliberately plain.
 *
 * Nothing here expresses an opinion about fonts, palettes or hero style, so a
 * fixed table can never decide how a customer's site looks. The real design is
 * always the one the AI design team authored and saved.
 */
export function neutralDesignFingerprint(): DesignFingerprint {
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


/** How many distinct design combinations the pools can express. */
export function fingerprintVocabularySize(): number {
  return (
    DESIGN_FAMILIES.length * HERO_COMPOSITIONS.length * BACKGROUND_SYSTEMS.length *
    SECTION_COMPOSITIONS.length * NAV_SYSTEMS.length * CTA_SYSTEMS.length *
    CARD_SYSTEMS.length * DECORATIVE_SYSTEMS.length * TYPE_SYSTEMS.length *
    COLOR_SYSTEMS.length * PAGE_SHELLS.length * SECTION_TRANSITIONS.length
  );
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

/** Converts the wide identity vocabulary into renderer-supported section tokens. */
export function sectionDesignFromFingerprint(
  kind: string,
  fingerprint: DesignFingerprint,
  index = 0,
): {
  variant: string;
  layout: "split" | "centered" | "image_left" | "image_right" | "full_bleed" | "editorial" | "layered" | "stacked";
  cardStyle: "soft" | "sharp" | "pill" | "glass" | "editorial" | "floating";
  imageTreatment: "natural" | "rounded" | "soft_shadow" | "glass_frame" | "duotone" | "gradient_overlay" | "cinematic" | "cutout" | "full_bleed";
  maxWidth: "narrow" | "standard" | "wide" | "edge";
} {
  const hero = fingerprint.heroComposition;
  const layout = kind === "hero"
    ? /full-bleed|poster|spotlight|banner|wide-statement/.test(hero)
      ? "full_bleed"
      : /centered|type-first|quiet|minimal|stacked/.test(hero)
        ? "centered"
        : /left|tall-portrait/.test(hero)
          ? "image_left"
          : /right|split/.test(hero)
            ? "image_right"
            : /layer|overlap|collage|floating|inset/.test(hero)
              ? "layered"
              : "editorial"
    : kind === "cta" || kind === "offer"
      ? "full_bleed"
      : index % 3 === 1
        ? "editorial"
        : index % 3 === 2
          ? "split"
          : "stacked";
  const card = fingerprint.cardSystem;
  const cardStyle = /sharp|rule|minimal/.test(card)
    ? "sharp"
    : /pill/.test(card)
      ? "pill"
      : /glass|inset/.test(card)
        ? "glass"
        : /editorial|media-side|wide-feature/.test(card)
          ? "editorial"
          : /elevated|floating|hover-lift|gradient-edge/.test(card)
            ? "floating"
            : "soft";
  const image = fingerprint.imageTreatment;
  const imageTreatment = /duotone|desaturated/.test(image)
    ? "duotone"
    : /gradient|grain/.test(image)
      ? "gradient_overlay"
      : /full-bleed/.test(image)
        ? "full_bleed"
        : /framed|outline/.test(image)
          ? "glass_frame"
          : /high-contrast/.test(image)
            ? "cinematic"
            : /rounded|arch/.test(image)
              ? "rounded"
              : "natural";
  const source = kind === "services" ? fingerprint.cardSystem
    : kind === "reviews" ? fingerprint.proofLayout
      : kind === "pricing" ? fingerprint.pricingLayout
        : kind === "faq" ? fingerprint.faqLayout
          : kind === "gallery" ? fingerprint.galleryLayout
            : kind === "process" ? fingerprint.timelineLayout
              : kind === "quote" || kind === "booking" || kind === "contact" ? fingerprint.formLayout
                : kind === "cta" || kind === "offer" ? fingerprint.ctaSystem
                  : kind === "hero" ? fingerprint.heroComposition
                    : fingerprint.sectionRhythm;
  return {
    variant: `${rendererVariant(kind, source)}--${safeToken(source)}`,
    layout,
    cardStyle,
    imageTreatment,
    maxWidth: /full-bleed|edge|wide|mosaic|band/.test(source) ? "edge" : layout === "centered" ? "standard" : "wide",
  };
}
