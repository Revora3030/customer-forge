/**
 * FACTS-ONLY FALLBACK SECTIONS.
 *
 * When the AI design team is out of capacity or credits (429 / 402 / timeouts)
 * after every retry, a first build used to stop with nothing to show. The
 * owner approved shipping a plain, good-looking layout instead and upgrading
 * it with an AI design later (2026-11-01).
 *
 * Every section, of ANY role the page plan used, gets a deterministic layout
 * built only from material already saved for the business:
 *   - the section's own saved words, pictures, cards, FAQ items and list items
 *     (already through the first-build fact gate), drawn by the legacy adapter;
 *   - the business facts the owner entered (name, services, place, phone,
 *     email, years in business), set inside fixed labels such as "Call us";
 *   - the working widgets (quote, booking, enquiry form, contact details,
 *     reviews) whose data the application reads from verified records.
 *
 * Nothing is invented: no prices, ratings, reviews, awards or claims. No
 * colours are set; the site theme decides. The tree is labelled
 * `fallback-<family>` and saved with FALLBACK_SECTION_SETTINGS so the site is
 * flagged for an AI upgrade, which runs only when the owner asks for it (an
 * upgrade spends AI credits).
 *
 * Pure: no network, no AI. Shared by the build worker and tests.
 */
import { MODEL_COMPONENT_KIND } from "@/lib/site-models";
import type { CompositionFaqItem, CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { isSafeHref } from "@/lib/builder/composition-tree";
import { legacySectionToComposition, type LegacyComponent } from "@/lib/builder/legacy-composition";
import { safeParagraph, safeText } from "@/lib/builder/presentation";

/** Settings merged into a section whose saved layout is a fallback. */
export const FALLBACK_SECTION_SETTINGS = { layoutSource: "fallback", needsAiUpgrade: true } as const;

/** Tree labels of fallback layouts start with this. */
export const FALLBACK_LABEL_PREFIX = "fallback-";

export type FallbackComponent = {
  id: string;
  kind: string;
  label?: string | null;
  body?: string | null;
  /** Stored picture path (first-build rows) or resolved URL (render rows). */
  media_url?: string | null;
  url?: string | null;
  link_url?: string | null;
  link_label?: string | null;
};

export type FallbackSection = {
  id: string;
  kind: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  components?: FallbackComponent[] | null;
};

/** Owner-entered business facts (DnaFacts subset). */
export type FallbackFacts = {
  businessName?: string | null;
  services?: readonly string[] | null;
  description?: string | null;
  city?: string | null;
  region?: string | null;
  serviceArea?: string | null;
  phone?: string | null;
  email?: string | null;
  yearsInBusiness?: number | null;
};

export type FallbackOptions = {
  facts: FallbackFacts;
  /** The first section of a page: its heading becomes the page's h1. */
  lead?: boolean;
  /** Stable seed (site slug) for the legacy adapter's layout variant. */
  seed?: string | null;
  /** The site's own enquiry page ("/contact"), when it has one. */
  enquiryHref?: string | null;
};

export type FallbackFamily =
  | "hero" | "services" | "proof" | "faq" | "process" | "area" | "about"
  | "cta" | "quote" | "booking" | "contact" | "sticky" | "gallery" | "generic";

/** Which deterministic layout a section role gets. Any unknown role is "generic". */
export function fallbackFamily(kind: string, lead = false): FallbackFamily {
  const role = String(kind ?? "").toLowerCase();
  if (role === "quote" || role === "pricing_quote") return "quote";
  if (role === "booking" || role === "book") return "booking";
  if (role === "contact") return "contact";
  if (role === "sticky_cta") return "sticky";
  if (role === "hero" || role === "home") return "hero";
  if (/faq|question/.test(role)) return "faq";
  if (/review|testimonial|proof|trust|stats|guarantee/.test(role)) return "proof";
  if (/process|step|how_it_works|how-it-works/.test(role)) return "process";
  if (/area|location|where|coverage/.test(role)) return "area";
  if (/service|offer|menu|pricing|package/.test(role)) return "services";
  if (/gallery|work|portfolio|project/.test(role)) return "gallery";
  if (/about|story|value|team|intro|why|benefit/.test(role)) return "about";
  if (/cta|action|lead_magnet/.test(role)) return "cta";
  return lead ? "hero" : "generic";
}

/** The legacy adapter kind that draws a family's saved words and cards. */
const LEGACY_KIND: Record<FallbackFamily, string> = {
  hero: "hero", services: "services", proof: "social_proof", faq: "faq", process: "process",
  area: "service_area", about: "story", cta: "cta", quote: "page", booking: "page",
  contact: "page", sticky: "cta", gallery: "page", generic: "page",
};

/** Fixed section labels used only when the section has no saved heading. */
const DEFAULT_HEADING: Partial<Record<FallbackFamily, string>> = {
  services: "Services",
  proof: "Why customers choose us",
  faq: "Questions",
  process: "How it works",
  area: "Where we work",
  about: "About us",
  cta: "Get in touch",
  quote: "Get a quote",
  booking: "Book a time",
  contact: "Contact us",
  gallery: "Our work",
};

/** Fixed words a fallback layout may use besides the saved material and facts. */
export const FALLBACK_FIXED_TEXT: readonly string[] = [
  ...Object.values(DEFAULT_HEADING),
  "Call us", "Email us", "Send a message", "Get in touch", "Serving", "Based in",
  "years in business", "year in business", "Services we offer", "3D model", "Picture",
];

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
const clean = (value: string | null | undefined, max = 240): string | null => {
  const text = safeText(value);
  return text ? clip(text, max) : null;
};

const PHONE_DIGITS = /\d/g;
/** A tel: link for the owner's real phone number, or null. */
export function phoneHref(phone: string | null | undefined): string | null {
  const raw = String(phone ?? "").trim();
  if ((raw.match(PHONE_DIGITS) ?? []).length < 7) return null;
  const href = `tel:${raw.replace(/[^\d+]/g, "")}`;
  return isSafeHref(href) ? href : null;
}

/** A mailto: link for the owner's real email address, or null. */
export function emailHref(email: string | null | undefined): string | null {
  const raw = String(email ?? "").trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(raw)) return null;
  const href = `mailto:${raw}`;
  return isSafeHref(href) ? href : null;
}

const BUTTON = (text: string, href: string, primary: boolean): CompositionNode => ({
  type: "button",
  text,
  href,
  style: { paddingX: 24, paddingY: 14, radius: 999, weight: 600, size: 15, borderWidth: primary ? 2 : 1 },
});

/** Call / email / enquiry buttons from the owner's real contact facts only. */
export function contactActions(options: FallbackOptions, max = 2): CompositionNode[] {
  const actions: CompositionNode[] = [];
  const tel = phoneHref(options.facts.phone);
  const mail = emailHref(options.facts.email);
  const enquiry = options.enquiryHref && isSafeHref(options.enquiryHref) ? options.enquiryHref : null;
  if (tel) actions.push(BUTTON("Call us", tel, actions.length === 0));
  if (enquiry) actions.push(BUTTON("Send a message", enquiry, actions.length === 0));
  if (mail) actions.push(BUTTON("Email us", mail, actions.length === 0));
  return actions.slice(0, max);
}

const actionRow = (buttons: CompositionNode[], center = false): CompositionNode[] =>
  buttons.length ? [{ type: "row", style: { gap: 12, ...(center ? { justify: "center" as const } : {}) }, children: buttons }] : [];

const heading = (text: string, level: 1 | 2 | 3, hero = false): CompositionNode => ({
  type: "heading",
  level,
  text,
  style: hero
    ? { size: 60, weight: 650, lineHeight: 1.05, letterSpacing: -0.02 }
    : level === 3
      ? { size: 20, weight: 600, lineHeight: 1.25 }
      : { size: 40, weight: 650, lineHeight: 1.1, letterSpacing: -0.01 },
  ...(hero ? { responsive: { mobile: { size: 38 } } } : level === 2 ? { responsive: { mobile: { size: 30 } } } : {}),
});

const paragraph = (text: string, size = 17): CompositionNode => ({
  type: "text",
  text,
  style: { size, lineHeight: 1.6, opacity: 80, maxWidth: 680 },
});

const stack = (children: CompositionNode[], gap = 18): CompositionNode => ({ type: "stack", style: { gap }, children });

/** Where the business works, from its facts only. */
export function placeLine(facts: FallbackFacts): string | null {
  const area = clean(facts.serviceArea, 160);
  if (area) return `Serving ${area}`;
  const place = [clean(facts.city, 80), clean(facts.region, 60)].filter(Boolean).join(", ");
  return place ? `Based in ${place}` : null;
}

function yearsLine(facts: FallbackFacts): string | null {
  const years = facts.yearsInBusiness;
  if (typeof years !== "number" || !Number.isFinite(years) || years < 1 || years > 200) return null;
  const whole = Math.floor(years);
  return `${whole} ${whole === 1 ? "year" : "years"} in business`;
}

function serviceNames(facts: FallbackFacts): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of facts.services ?? []) {
    const text = clean(name, 80);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    names.push(text);
  }
  return names.slice(0, 12);
}

const asLegacy = (component: FallbackComponent): LegacyComponent => ({
  id: component.id,
  kind: component.kind,
  label: component.label ?? null,
  body: component.body ?? null,
  url: component.url ?? component.media_url ?? null,
  link_url: component.link_url ?? null,
  link_label: component.link_label ?? null,
});

const hasMedia = (component: FallbackComponent) => Boolean(component.url ?? component.media_url);

/** Every picture reference a tree shows. */
export function usedMediaRefs(node: CompositionNode, into = new Set<string>()): Set<string> {
  if (node.mediaRef) into.add(node.mediaRef);
  for (const child of node.children ?? []) usedMediaRefs(child, into);
  return into;
}

/**
 * Children of the legacy adapter's root for this section's saved material, or
 * [] when there is nothing to draw. The adapter invents no copy.
 */
function savedBlocks(section: FallbackSection, family: FallbackFamily, options: FallbackOptions, extraComponents: LegacyComponent[] = []): CompositionNode[] {
  const components = [...(section.components ?? []).map(asLegacy), ...extraComponents];
  const tree = legacySectionToComposition(
    {
      id: section.id,
      kind: LEGACY_KIND[family],
      heading: section.heading ?? null,
      subheading: section.subheading ?? null,
      body: section.body ?? null,
      components,
    },
    { lead: options.lead === true, seed: options.seed ?? null },
  );
  return tree?.root.children ?? [];
}

const textOf = (node: CompositionNode): string[] => [
  ...(node.text ? [node.text] : []),
  ...(node.children ?? []).flatMap(textOf),
];

/** Pictures this section owns that the layout above did not show yet. */
function leftoverMedia(section: FallbackSection, shown: Set<string>, alt: string): CompositionNode[] {
  const nodes: CompositionNode[] = [];
  for (const component of section.components ?? []) {
    if (!hasMedia(component) || shown.has(component.id)) continue;
    const label = clean(component.label, 120) ?? alt;
    if (component.kind === MODEL_COMPONENT_KIND) {
      nodes.push({ type: "model_3d_viewer", mediaRef: component.id, text: "Turn it around", alt: label || "3D model", style: { radius: 24 } });
    } else {
      nodes.push({ type: "media", mediaRef: component.id, alt: label || "Picture", style: { aspect: "4:3", radius: 16, objectFit: "cover" } });
    }
    shown.add(component.id);
  }
  if (!nodes.length) return [];
  return [{ type: "grid", style: { columns: nodes.length === 1 ? 1 : 2, gap: 16 }, responsive: { mobile: { columns: 1 } }, children: nodes }];
}

function faqItems(section: FallbackSection): CompositionFaqItem[] {
  const items: CompositionFaqItem[] = [];
  for (const component of section.components ?? []) {
    if (component.kind !== "faq_item") continue;
    const question = clean(component.label, 200);
    const answer = safeParagraph(component.body);
    if (question && answer) items.push({ question, answer: clip(answer, 1200) });
  }
  return items.slice(0, 12);
}

function listItems(section: FallbackSection): string[] {
  return (section.components ?? [])
    .filter((component) => component.kind === "list_item" || component.kind === "step" || component.kind === "benefit")
    .map((component) => clean(component.label ?? component.body, 200))
    .filter((line): line is string => Boolean(line))
    .slice(0, 10);
}

const hasSavedCards = (section: FallbackSection) =>
  (section.components ?? []).some((component) => component.kind === "card" && (safeText(component.label) || safeText(component.body)));

/**
 * The deterministic layout for one section. Never null and never empty: a
 * section with no saved material still gets its heading (or the business
 * name) and the real ways to reach the business.
 */
export function fallbackSectionComposition(section: FallbackSection, options: FallbackOptions): CompositionTree {
  const family = fallbackFamily(section.kind, options.lead === true);
  const facts = options.facts;
  const name = clean(facts.businessName, 120);
  const isHero = family === "hero";
  const level: 1 | 2 = options.lead ? 1 : 2;
  const blocks: CompositionNode[] = [];
  const savedHeading = clean(section.heading, 200);
  const fallbackHeading = isHero ? name : DEFAULT_HEADING[family] ?? null;

  // Cards for the service list come from the owner's real service names only.
  const serviceCards: LegacyComponent[] =
    family === "services" && !hasSavedCards(section)
      ? serviceNames(facts).map((service, index) => ({ id: `${section.id}-svc-${index}`, kind: "card", label: service, body: null, url: null, link_url: options.enquiryHref ?? null, link_label: options.enquiryHref ? "Ask about this" : null }))
      : [];
  let saved = savedBlocks(section, family, options, serviceCards);
  // The saved words carry no heading: lead with a fixed label or the business name.
  const savedText = saved.flatMap(textOf);
  if (!savedHeading && fallbackHeading && !savedText.includes(fallbackHeading)) blocks.push(heading(fallbackHeading, level, isHero));
  blocks.push(...saved);

  switch (family) {
    case "hero": {
      const lines = [!clean(section.subheading) && !clean(section.body) ? clean(facts.description, 280) : null, placeLine(facts)].filter((line): line is string => Boolean(line));
      for (const line of lines) blocks.push(paragraph(line, 19));
      if (!savedText.length || !(section.components ?? []).some((c) => c.kind === "button")) blocks.push(...actionRow(contactActions(options)));
      break;
    }
    case "faq": {
      const items = faqItems(section);
      if (items.length) blocks.push({ type: "faq_accordion", faqItems: items.map((item, index) => (index === 0 ? { ...item, defaultOpen: true } : item)) });
      else blocks.push(...actionRow(contactActions(options)));
      break;
    }
    case "process": {
      const items = listItems(section);
      if (items.length) blocks.push({ type: "list", items, style: { size: 17, lineHeight: 1.6, gap: 12 } });
      blocks.push(...actionRow(contactActions(options, 1)));
      break;
    }
    case "about": {
      const items = listItems(section);
      if (items.length) blocks.push({ type: "list", items, style: { size: 17, lineHeight: 1.6, gap: 12 } });
      if (!savedText.length && facts.description) blocks.push(paragraph(clean(facts.description, 600)!));
      break;
    }
    case "services": {
      if (!hasSavedCards(section) && !serviceCards.length) blocks.push(paragraph("Services we offer"), ...actionRow(contactActions(options)));
      break;
    }
    case "proof": {
      // Never a typed review or rating: the review wall shows only the
      // business's real, stored reviews (and nothing when it has none).
      const facts_ = [yearsLine(facts), placeLine(facts)].filter((line): line is string => Boolean(line));
      if (facts_.length) blocks.push({ type: "list", items: facts_, style: { size: 17, gap: 10 } });
      blocks.push({ type: "widget", text: "review_wall" });
      break;
    }
    case "area": {
      const line = placeLine(facts);
      if (line && !savedText.some((text) => text.includes(line))) blocks.push(paragraph(line, 19));
      blocks.push(...actionRow(contactActions(options)));
      break;
    }
    case "cta":
    case "generic":
    case "gallery": {
      if (family !== "gallery" || !saved.length) blocks.push(...actionRow(contactActions(options), family === "cta"));
      break;
    }
    case "quote":
      blocks.push({ type: "widget", text: "quote_calculator" });
      break;
    case "booking":
      blocks.push({ type: "widget", text: "booking_form" });
      break;
    case "contact":
      blocks.push(
        { type: "grid", style: { columns: 2, gap: 40, items: "start" }, responsive: { mobile: { columns: 1, gap: 28 } }, children: [
          stack([{ type: "widget", text: "contact_details" }, ...actionRow(contactActions(options, 2))], 20),
          { type: "widget", text: "enquiry_form" },
        ] },
      );
      break;
    case "sticky": {
      const actions = contactActions(options, 2);
      const [primary, secondary] = actions;
      blocks.length = 0;
      saved = [];
      if (primary?.href && primary.text) {
        blocks.push({
          type: "mobile_sticky_bar",
          primaryCta: { label: primary.text, href: primary.href, ...(name ? { ariaLabel: `${primary.text}: ${name}` } : {}) },
          ...(secondary?.href && secondary.text ? { secondaryCta: { label: secondary.text, href: secondary.href } } : {}),
        });
      }
      break;
    }
  }

  // Every picture the section owns stays visible (the validator requires it).
  const shown = new Set<string>();
  for (const block of blocks) usedMediaRefs(block, shown);
  blocks.push(...leftoverMedia(section, shown, savedHeading ?? name ?? ""));

  // Floor: never an empty section.
  if (!blocks.length) {
    const title = savedHeading ?? fallbackHeading ?? name;
    if (title) blocks.push(heading(title, level, isHero));
    blocks.push(...actionRow(contactActions(options)));
    if (!blocks.length && name) blocks.push(paragraph(name));
  }
  if (!blocks.length) blocks.push({ type: "widget", text: "contact_details" });

  return {
    version: 1,
    label: `${FALLBACK_LABEL_PREFIX}${family}`,
    root: {
      type: "stack",
      style: { maxWidth: 1152, paddingX: 24, paddingY: isHero ? 96 : 72, gap: 40 },
      responsive: { mobile: { paddingX: 16, paddingY: isHero ? 56 : 48, gap: 28 } },
      children: blocks,
    },
  };
}

/**
 * The smallest safe layout, used when a section's full fallback fails the
 * validator: its heading (or a fixed label), the real contact actions, and
 * every picture it owns.
 */
export function fallbackFloorComposition(section: FallbackSection, options: FallbackOptions): CompositionTree {
  const family = fallbackFamily(section.kind, options.lead === true);
  const title = clean(section.heading, 200) ?? DEFAULT_HEADING[family] ?? clean(options.facts.businessName, 120) ?? "Get in touch";
  const blocks: CompositionNode[] = [heading(title, options.lead ? 1 : 2, family === "hero"), ...actionRow(contactActions(options))];
  blocks.push(...leftoverMedia(section, new Set(), title));
  if (family === "contact") blocks.push({ type: "widget", text: "enquiry_form" });
  if (family === "quote") blocks.push({ type: "widget", text: "quote_calculator" });
  if (family === "booking") blocks.push({ type: "widget", text: "booking_form" });
  return {
    version: 1,
    label: `${FALLBACK_LABEL_PREFIX}floor`,
    root: { type: "stack", style: { maxWidth: 1152, paddingX: 24, paddingY: 72, gap: 32 }, responsive: { mobile: { paddingX: 16, paddingY: 48 } }, children: blocks },
  };
}

/** True when a section's saved layout is a facts-only fallback waiting for an AI upgrade. */
export function isFallbackLayout(settings: unknown): boolean {
  const value = settings as Record<string, unknown> | null | undefined;
  if (!value || typeof value !== "object") return false;
  if (value["layoutSource"] === "fallback" || value["needsAiUpgrade"] === true) return true;
  const label = (value["composition"] as { label?: unknown } | undefined)?.label;
  return typeof label === "string" && label.startsWith(FALLBACK_LABEL_PREFIX);
}
