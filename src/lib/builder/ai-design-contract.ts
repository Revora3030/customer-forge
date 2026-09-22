/**
 * THE AI DESIGN CONTRACT — THE ONE SOURCE OF CREATIVE TRUTH.
 *
 * Revora no longer selects a website from a template library. The models decide
 * the design, and this module is the only shape that design may travel in. A
 * contract describes a COMPLETE site design — identity, type, colour, spacing,
 * grid, navigation, hero, CTA system, per-page section order and per-section
 * layout, cards, forms, proof, imagery, art direction, motion, responsive
 * behaviour, accessibility constraints and conversion goals — and never a
 * template id.
 *
 * Three rules this module enforces structurally:
 *
 *   1. A contract's authority is always the AI. There is no "template" source.
 *   2. A contract may not carry a template/preset identifier anywhere in it.
 *      A deep scan rejects the whole contract if one appears, so a legacy
 *      selector can never smuggle itself back in as creative authority.
 *   3. Every page may compose itself differently. No section is mandatory, no
 *      section order is shared, and no page has to exist on every site.
 *
 * Deterministic code may still REJECT a contract for safety (unreadable
 * contrast, unusable touch targets, missing accessibility floor). It may never
 * REPLACE the creative decisions inside it.
 *
 * Pure module: no environment, no network, no secrets.
 */

export const CREATIVE_AUTHORITY = "ai_design_contract" as const;

/** Identifiers that used to choose a design. None may appear in a contract. */
const FORBIDDEN_AUTHORITY_KEYS = [
  "templateid",
  "template_id",
  "template",
  "templates",
  "presetid",
  "preset_id",
  "preset",
  "presets",
  "layoutrecipe",
  "layout_recipe",
  "sectionpreset",
  "section_preset",
  "defaultsections",
  "default_sections",
  "fallbacksections",
  "fallback_sections",
];

export type ResponsiveBehaviour = {
  /** Section ids in the order they appear on a narrow screen. */
  order: string[];
  /** Type scale multiplier at this width, relative to the desktop scale. */
  typeScale: number;
  /** How the primary action behaves at this width. */
  cta: "inline" | "stacked" | "sticky_bar" | "hidden";
  /** How multi-item groups lay out at this width. */
  columns: number;
  /** How imagery is cropped at this width. */
  imageCrop: "square" | "portrait" | "landscape" | "wide" | "full_bleed";
  /** Navigation behaviour at this width. */
  nav: "full" | "condensed" | "drawer" | "bottom_bar";
};

export type SectionDesign = {
  /** Stable id used to reference this section from responsive plans. */
  id: string;
  /** Section role, chosen by the AI. Not drawn from a fixed catalogue. */
  role: string;
  /** Composition the AI specified for this section. */
  layout: string;
  /** Why this section exists on this page, in the AI's own words. */
  intent: string;
  /** Requires imagery. An empty visual container is never acceptable. */
  media: "none" | "optional" | "required";
  /** Emphasis in the page's visual hierarchy: 1 is the loudest. */
  emphasis: number;
};

export type PageDesign = {
  /** Page path, without a leading slash. "home" is the root. */
  slug: string;
  title: string;
  /** Page purpose in the conversion architecture. */
  purpose: string;
  /** Section order for THIS page. Pages may differ completely. */
  sections: SectionDesign[];
  /** The page's own primary conversion action. */
  primaryAction: string;
  /** Per-width behaviour the AI intended, keyed by viewport width. */
  responsive: Record<number, ResponsiveBehaviour>;
};

export type AiDesignContract = {
  /** Always the AI. There is deliberately no other allowed value. */
  authority: typeof CREATIVE_AUTHORITY;
  /** Which specialist produced the creative direction. */
  directedBy: string;
  /** Which specialist reviewed it adversarially, when review ran. */
  reviewedBy: string | null;
  identity: {
    name: string;
    concept: string;
    personality: string;
    /** What makes this site's design specific to this business. */
    differentiators: string[];
  };
  typography: {
    display: string;
    body: string;
    scaleRatio: number;
    headlineCase: "sentence" | "title" | "upper";
    headlineWeight: "light" | "regular" | "medium" | "bold";
    measureCh: number;
  };
  color: {
    background: string;
    surface: string;
    text: string;
    accent: string;
    /** Extra roles the AI chose to introduce. */
    extras: Record<string, string>;
    mode: "dark" | "light" | "duotone" | "high_contrast";
  };
  backgrounds: string[];
  spacing: { baseline: number; sectionRhythm: number[]; density: "tight" | "balanced" | "airy" };
  grid: { container: number; columns: number; gutter: number; behaviour: string };
  navigation: { structure: string; items: string[]; behaviour: string };
  hero: { composition: string; mediaTreatment: string; intent: string };
  cta: { system: string; primary: string; secondary: string | null; placement: string[] };
  cards: { style: string; mediaRatio: string };
  forms: { layout: string; fields: string[] };
  imagery: {
    artDirection: string;
    treatment: string;
    /** Slot names the design needs filled, in priority order. */
    slots: string[];
  };
  motion: { pattern: string; intensity: "none" | "subtle" | "expressive" };
  accessibility: { minContrast: number; minTouchTargetPx: number; reducedMotionSafe: boolean };
  conversion: { goal: string; steps: string[] };
  /** Each page composes itself. Different structures are expected, not a bug. */
  pages: PageDesign[];
};

export type ContractViolation = {
  path: string;
  detail: string;
  severity: "blocker" | "warning";
};

function deepScanForTemplateAuthority(value: unknown, path: string, found: ContractViolation[]) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => deepScanForTemplateAuthority(entry, `${path}[${index}]`, found));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_AUTHORITY_KEYS.includes(key.toLowerCase()))
      found.push({
        path: `${path}.${key}`,
        detail:
          "a template or preset identifier cannot appear in an AI design contract: the models own creative decisions",
        severity: "blocker",
      });
    deepScanForTemplateAuthority(entry, `${path}.${key}`, found);
  }
}

/**
 * Validates a contract as a creative authority. Safety floors are enforced;
 * creative choices are not second-guessed.
 */
export function validateAiDesignContract(contract: AiDesignContract): {
  valid: boolean;
  violations: ContractViolation[];
} {
  const violations: ContractViolation[] = [];
  if (contract.authority !== CREATIVE_AUTHORITY)
    violations.push({
      path: "authority",
      detail: "creative authority must be the AI design contract",
      severity: "blocker",
    });
  deepScanForTemplateAuthority(contract, "contract", violations);

  if (!contract.identity.concept.trim())
    violations.push({ path: "identity.concept", detail: "the AI did not state a visual concept", severity: "blocker" });
  if (contract.pages.length === 0)
    violations.push({ path: "pages", detail: "a site needs at least one designed page", severity: "blocker" });
  if (!contract.pages.some((page) => page.slug === "home"))
    violations.push({ path: "pages", detail: "no home page was designed", severity: "blocker" });

  const seen = new Set<string>();
  for (const page of contract.pages) {
    if (seen.has(page.slug))
      violations.push({ path: `pages.${page.slug}`, detail: "duplicate page", severity: "blocker" });
    seen.add(page.slug);
    if (page.sections.length === 0)
      violations.push({
        path: `pages.${page.slug}.sections`,
        detail: "the AI designed a page with no sections",
        severity: "blocker",
      });
    const ids = new Set<string>();
    for (const section of page.sections) {
      if (ids.has(section.id))
        violations.push({
          path: `pages.${page.slug}.sections.${section.id}`,
          detail: "duplicate section id",
          severity: "blocker",
        });
      ids.add(section.id);
    }
    // Responsive behaviour is specified, not derived by shrinking a desktop page.
    for (const width of REQUIRED_RESPONSIVE_WIDTHS)
      if (!page.responsive[width])
        violations.push({
          path: `pages.${page.slug}.responsive.${width}`,
          detail: `the AI did not specify behaviour at ${width}px`,
          severity: "blocker",
        });
    for (const [width, behaviour] of Object.entries(page.responsive)) {
      const unknown = behaviour.order.filter((id) => !ids.has(id));
      if (unknown.length > 0)
        violations.push({
          path: `pages.${page.slug}.responsive.${width}.order`,
          detail: `references sections that do not exist: ${unknown.join(", ")}`,
          severity: "blocker",
        });
    }
  }

  // Accessibility and touch floors are SAFETY, so they are enforced. They
  // constrain nothing about layout, colour relationships or composition.
  if (contract.accessibility.minContrast < 4.5)
    violations.push({
      path: "accessibility.minContrast",
      detail: "text contrast below 4.5:1 is not publishable",
      severity: "blocker",
    });
  if (contract.accessibility.minTouchTargetPx < 44)
    violations.push({
      path: "accessibility.minTouchTargetPx",
      detail: "interactive targets must be at least 44px",
      severity: "blocker",
    });

  return { valid: violations.every((entry) => entry.severity !== "blocker"), violations };
}

/** The widths every AI design must intentionally account for. */
export const REQUIRED_RESPONSIVE_WIDTHS = [
  320, 375, 390, 430, 768, 1024, 1280, 1440,
] as const;

export type MaterialSection = { kind: string; [key: string]: unknown };
export type MaterialPage = { slug: string; sections: MaterialSection[]; [key: string]: unknown };

export type ContractApplication<P> = {
  pages: P[];
  /** Pages the deterministic layer produced that the AI design did not ask for. */
  droppedPages: string[];
  /** Sections dropped because the AI design did not place them on that page. */
  droppedSections: { page: string; kind: string }[];
  /** Sections the AI asked for that no real content could fill. Never faked. */
  unfilledSections: { page: string; role: string; media: SectionDesign["media"] }[];
};

/**
 * Imposes the AI's page architecture on rendered material.
 *
 * The renderer still produces the safe building blocks, but WHICH pages exist,
 * WHICH sections appear and IN WHAT ORDER is decided here, by the contract. A
 * section the AI did not place is dropped rather than kept "because the old
 * planner always emitted it", and a section the AI placed but nothing can fill
 * is reported rather than rendered as an empty container.
 */
export function applyDesignContract<P extends MaterialPage>(
  material: P[],
  contract: AiDesignContract,
): ContractApplication<P> {
  const droppedSections: ContractApplication<P>["droppedSections"] = [];
  const unfilledSections: ContractApplication<P>["unfilledSections"] = [];
  const bySlug = new Map(material.map((page) => [page.slug, page]));
  const pages: P[] = [];

  for (const design of contract.pages) {
    const source = bySlug.get(design.slug);
    if (!source) {
      for (const section of design.sections)
        unfilledSections.push({ page: design.slug, role: section.role, media: section.media });
      continue;
    }
    const remaining = [...source.sections];
    const ordered: MaterialSection[] = [];
    for (const section of design.sections) {
      const index = remaining.findIndex((candidate) => candidate.kind === section.role);
      if (index < 0) {
        unfilledSections.push({ page: design.slug, role: section.role, media: section.media });
        continue;
      }
      const [picked] = remaining.splice(index, 1);
      if (picked) ordered.push({ ...picked, ai_section_id: section.id, ai_layout: section.layout });
    }
    for (const leftover of remaining)
      droppedSections.push({ page: design.slug, kind: leftover.kind });
    if (ordered.length > 0) pages.push({ ...source, sections: ordered });
  }

  const kept = new Set(pages.map((page) => page.slug));
  const droppedPages = material.map((page) => page.slug).filter((slug) => !kept.has(slug));
  return { pages, droppedPages, droppedSections, unfilledSections };
}
