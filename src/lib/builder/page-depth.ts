/**
 * PAGE DEPTH — a measurable check that a page says enough to be useful.
 *
 * It never adds a section, heading or word. It only measures what the AI
 * already wrote (visible text, content beats beyond the heading, a closing
 * action) and turns any shortfall into a plain repair note that goes back to
 * the AI: first the page architect, then the section-wording pass.
 *
 * Pure module: no environment, no network, no secrets.
 */

export type DepthComponent = {
  kind?: string | null;
  label?: string | null;
  body?: string | null;
  link_url?: string | null;
  media_url?: string | null;
};

export type DepthSection = {
  /** Renderer role (materialized rows use `kind`, architecture uses `role`). */
  kind?: string | null;
  role?: string | null;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  /** Material the architect asked to attach (service_cards, faqs …). */
  includes?: readonly string[] | null;
  components?: readonly DepthComponent[] | null;
};

export type DepthPage = {
  slug: string;
  kind?: string | null;
  sections: readonly DepthSection[];
};

export type PageDepth = {
  /** Characters of visible text on the page. */
  visibleChars: number;
  /** Content beats beyond the headings (bodies, lists, cards, FAQs, pictures, working features). */
  beats: number;
  hasClosingAction: boolean;
  /** Plain repair notes for the AI; empty when the page meets the bar. */
  notes: string[];
};

/** Minimum content beats beyond the headings. A measure, not a page template. */
export const MIN_CONTENT_BEATS = 2;

/** Working features: each one is a real thing a visitor can do on the page. */
const FUNCTIONAL_ROLES = new Set(["quote", "booking", "contact", "embed", "post_list"]);
const ACTION_ROLES = new Set(["quote", "booking", "contact", "sticky_cta"]);
const LEGAL_SLUG = /^(privacy|privacy-policy|terms|terms-of-service|terms-and-conditions|legal|cookies?|cookie-policy|accessibility|disclaimer)$/;
const CONTENT_COMPONENTS = new Set(["card", "faq_item", "list_item", "benefit", "step", "feature", "quote", "stat", "service_card", "price_row"]);
const IMAGE_COMPONENTS = new Set(["image", "hero_image", "gallery"]);
const ACTION_COMPONENTS = new Set(["button", "cta", "link"]);

const text = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

export function isLegalPage(page: Pick<DepthPage, "slug" | "kind">): boolean {
  return LEGAL_SLUG.test(page.slug) || /legal|privacy|terms/i.test(text(page.kind));
}

/** Measures one page. Same page in, same result out. */
export function auditPageDepth(page: DepthPage): PageDepth {
  let visibleChars = 0;
  let beats = 0;
  let hasClosingAction = false;
  const emptySections: string[] = [];

  for (const section of page.sections) {
    const role = text(section.kind ?? section.role) || "section";
    const heading = text(section.heading);
    const subheading = text(section.subheading);
    const body = text(section.body);
    const includes = section.includes ?? [];
    const components = section.components ?? [];
    visibleChars += heading.length + subheading.length + body.length;
    let sectionBeats = 0;
    if (body) sectionBeats += 1;
    if (FUNCTIONAL_ROLES.has(role)) sectionBeats += 1;
    if (ACTION_ROLES.has(role)) hasClosingAction = true;
    if (includes.includes("primary_action")) hasClosingAction = true;
    // Attached material the architect asked for counts once it is real.
    for (const include of ["service_cards", "faqs", "benefits"])
      if (includes.includes(include) && !components.length) sectionBeats += 1;

    let contentGroup = false;
    let imageGroup = false;
    for (const component of components) {
      const kind = text(component.kind);
      const words = text(component.label).length + text(component.body).length;
      visibleChars += words;
      if (CONTENT_COMPONENTS.has(kind) && words > 0) contentGroup = true;
      if (IMAGE_COMPONENTS.has(kind) && text(component.media_url)) imageGroup = true;
      if (ACTION_COMPONENTS.has(kind) && text(component.link_url)) hasClosingAction = true;
      if (kind === "card" && text(component.link_url)) hasClosingAction = true;
    }
    if (contentGroup) sectionBeats += 1;
    if (imageGroup) sectionBeats += 1;
    if (sectionBeats === 0 && !ACTION_ROLES.has(role) && role !== "hero") emptySections.push(role);
    beats += sectionBeats;
  }

  const notes: string[] = [];
  const legal = isLegalPage(page);
  if (beats < MIN_CONTENT_BEATS)
    notes.push(
      `The "${page.slug}" page has ${beats} content beat${beats === 1 ? "" : "s"} beyond its headings (the bar is ${MIN_CONTENT_BEATS}).` +
        (emptySections.length
          ? ` These sections have a heading and nothing else: ${[...new Set(emptySections)].join(", ")}. Write each one a body from the supplied facts only, or ask for real material (service_cards, faqs, benefits).`
          : " Give its sections bodies from the supplied facts only, or ask for real material (service_cards, faqs, benefits)."),
    );
  if (!legal && !hasClosingAction)
    notes.push(
      `The "${page.slug}" page has no closing action. End it with a section that includes the primary_action, or a real quote, booking or contact section.`,
    );
  return { visibleChars, beats, hasClosingAction, notes };
}

/** Depth for every page, keyed by slug. */
export function auditSiteDepth(pages: readonly DepthPage[]): Record<string, PageDepth> {
  return Object.fromEntries(pages.map((page) => [page.slug, auditPageDepth(page)]));
}

/** All repair notes across a site, in page order. */
export function depthRepairNotes(depth: Record<string, PageDepth>): string[] {
  return Object.values(depth).flatMap((entry) => entry.notes);
}

/** The measured numbers, compact enough to hand a reviewer as input. */
export function depthNumbers(depth: Record<string, PageDepth>): Record<string, Omit<PageDepth, "notes">> {
  return Object.fromEntries(
    Object.entries(depth).map(([slug, { visibleChars, beats, hasClosingAction }]) => [
      slug,
      { visibleChars, beats, hasClosingAction },
    ]),
  );
}
