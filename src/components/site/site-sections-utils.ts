import { premiumSurface } from "@/lib/site-theme";
import type { PublicSite } from "@/lib/public-site.functions";
import { readComposition } from "@/lib/builder/composition-tree";
import { safeText } from "@/lib/builder/presentation";

type Site = NonNullable<PublicSite>;
type Section = NonNullable<Site["content"]>["sections"][number];

/**
 * The page surface colour as #RRGGBB. A short #RGB value used to reach the
 * layout renderer unexpanded, where it was ignored, so the readability guard had
 * no surface to measure and white headings stayed white on pale surfaces.
 */
export function siteSurface(site: Site): string | null {
  const profile = (site.profile ?? null) as { secondary_color?: string | null } | null;
  // The same corrected surface the page theme paints, so section text is
  // measured against the colour visitors actually see.
  return premiumSurface(normalizeHex(profile?.secondary_color));
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : raw || null;
}

/**
 * The colour a section's text is actually drawn over: the section's own
 * background when the design gave it one, otherwise the page surface.
 * Measuring against the page surface while the section painted its own pale
 * grey panel is how white headings ended up invisible on light grey.
 */
export function sectionSurface(site: Site, sectionBg: string | null | undefined): string | null {
  const own = normalizeHex(sectionBg);
  return own && /^#[0-9a-f]{6}$/i.test(own) ? premiumSurface(own) : siteSurface(site);
}

/** True when a stored AI layout for this section already draws a level-1 heading. */
export function compositionHasH1(section: Section): boolean {
  const tree = readComposition(section.settings);
  if (!tree) return false;
  const walk = (node: { type?: string; level?: number; children?: unknown[] }): boolean =>
    (node.type === "heading" && node.level === 1) ||
    (node.children ?? []).some((child) => walk(child as { type?: string; level?: number; children?: unknown[] }));
  return walk(tree.root as { type?: string; level?: number; children?: unknown[] });
}

/** Index of the section that should carry the page h1, or -1 when an AI layout already does. */
export function leadSectionIndex(sections: Section[]): number {
  if (sections.some(compositionHasH1)) return -1;
  return sections.findIndex((section) => !readComposition(section.settings) && Boolean(safeText(section.heading)));
}

/** True when any section's AI layout already places the named live widget. */
export function pageHasWidget(sections: Section[], name: string): boolean {
  const walk = (node: { type?: string; text?: string; children?: unknown[]; tabs?: { children?: unknown[] }[] }): boolean =>
    (node.type === "widget" && node.text === name) ||
    (node.children ?? []).some((child) => walk(child as never)) ||
    (node.tabs ?? []).some((tab) => (tab.children ?? []).some((child) => walk(child as never)));
  return sections.some((section) => {
    const tree = readComposition(section.settings);
    return tree ? walk(tree.root as never) : false;
  });
}

/** True when any section's AI layout already carries its own node of this type. */
export function pageHasNodeType(sections: Section[], type: string): boolean {
  const walk = (node: { type?: string; children?: unknown[] }): boolean =>
    node.type === type || (node.children ?? []).some((child) => walk(child as never));
  return sections.some((section) => {
    const tree = readComposition(section.settings);
    return tree ? walk(tree.root as never) : false;
  });
}

/**
 * Actions for the phone-only sticky bar, from VERIFIED profile facts only:
 * a call button needs a real phone number, a book/quote button needs a real
 * page or section to land on. Nothing is shown when there is nothing real.
 */
export function stickyActions(input: {
  phone?: string | null;
  hasBookingPage?: boolean;
  hasQuote?: boolean;
  contactHref?: string | null;
}): { label: string; href: string; kind: "call" | "book" | "quote" | "contact" }[] {
  const actions: { label: string; href: string; kind: "call" | "book" | "quote" | "contact" }[] = [];
  const digits = String(input.phone ?? "").replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length >= 7) actions.push({ label: "Call", href: `tel:${digits}`, kind: "call" });
  if (input.hasBookingPage && input.contactHref) actions.push({ label: "Book now", href: input.contactHref, kind: "book" });
  else if (input.hasQuote && input.contactHref) actions.push({ label: "Get a quote", href: input.contactHref, kind: "quote" });
  else if (input.contactHref) actions.push({ label: "Contact us", href: input.contactHref, kind: "contact" });
  return actions.slice(0, 2);
}

/**
 * True when a stored section is complete enough to render. While the worker is
 * still writing a page, the draft preview can read a section row before its
 * kind or child arrays are in place (Sentry JAVASCRIPT-REACT-2/3/5/6). Such a
 * row is drawn as a shimmer placeholder instead of crashing the whole draft.
 */
export function isRenderableSection(section: unknown): section is Section {
  if (!section || typeof section !== "object") return false;
  const row = section as { id?: unknown; kind?: unknown; components?: unknown };
  if (typeof row.id !== "string" || !row.id) return false;
  if (typeof row.kind !== "string" || !row.kind) return false;
  if (row.components != null && !Array.isArray(row.components)) return false;
  return true;
}

/**
 * Normalises a section that passed `isRenderableSection` so nested readers
 * never see `undefined` where they expect an array or object.
 */
export function normalizeSection(section: Section): Section {
  const components = Array.isArray(section.components)
    ? section.components.filter((c): c is NonNullable<typeof c> => !!c && typeof c === "object")
    : [];
  return {
    ...section,
    settings: section.settings ?? {},
    components,
  } as Section;
}

/**
 * The "Area" row is only worth showing when it adds something the street
 * address does not already say — "Chapel Hill, NC" above "12 Main St, Chapel
 * Hill, NC" just repeats itself.
 */
export function distinctServiceArea(area: string | null | undefined, addressLine: string | null | undefined): string | null {
  const a = (area ?? "").trim();
  if (!a) return null;
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const address = norm(addressLine ?? "");
  if (address && (address.includes(norm(a)) || norm(a) === address)) return null;
  return a;
}

/** Widgets that let a visitor actually send something to the business. */
const LEAD_WIDGETS = ["enquiry_form", "booking_form", "quote_calculator"] as const;

/**
 * True when this page must show the general enquiry form because its own AI
 * layout has no way to send a message: it is the contact page, or a button on
 * it points at the "#contact-form" anchor. A page that already carries a
 * booking form, quote calculator or enquiry form is left alone.
 */
export function needsEnquiryForm(pageKind: string | null | undefined, pageSlug: string | null | undefined, sections: Section[]): boolean {
  if (LEAD_WIDGETS.some((name) => pageHasWidget(sections, name))) return false;
  const isContactPage = pageKind === "contact" || ["contact", "contact-us", "get-in-touch"].includes(String(pageSlug ?? "").toLowerCase());
  if (isContactPage) return true;
  return sections.some((section) => JSON.stringify(section.settings ?? {}).includes("#contact-form"));
}
