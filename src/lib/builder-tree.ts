/**
 * Pure logic behind the visual builder's selection, layers panel, drag-and-drop
 * ordering and duplication.
 *
 * Everything here operates on the real website content tree
 * (pages → sections → components), so the canvas, the layers panel and the AI
 * command bar all describe and address the same database rows. No parallel
 * representation of the website exists.
 */
import {
  sectionLabel,
  type ContentComponent,
  type ContentPage,
  type ContentSection,
} from "@/lib/website-content";

/* -------------------------------- selection -------------------------------- */

export type Selection =
  | { type: "page"; pageId: string }
  | { type: "section"; pageId: string; sectionId: string }
  | { type: "component"; pageId: string; sectionId: string; componentId: string }
  | null;

export function sameSelection(a: Selection, b: Selection): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  return (
    ("pageId" in a ? a.pageId : "") === ("pageId" in b ? b.pageId : "") &&
    ("sectionId" in a ? a.sectionId : "") === ("sectionId" in b ? b.sectionId : "") &&
    ("componentId" in a ? a.componentId : "") === ("componentId" in b ? b.componentId : "")
  );
}

/* ------------------------------ element naming ----------------------------- */

/** What kind of thing a component is, for toolbars and inspector tabs. */
export type ElementKind = "button" | "image" | "card" | "review" | "faq" | "price" | "text";

export function elementKindOf(component: ContentComponent): ElementKind {
  const kind = component.kind;
  if (kind === "button" || kind === "cta") return "button";
  if (kind === "gallery" || kind === "image" || (component.media_url && !component.body))
    return "image";
  if (kind === "faq_item" || kind === "faq") return "faq";
  if (kind === "price_row" || kind === "pricing") return "price";
  if (kind === "review" || kind === "reviews") return "review";
  if (kind === "service_card" || kind === "service" || kind === "step" || kind === "benefit")
    return "card";
  return "text";
}

const ELEMENT_LABEL: Record<ElementKind, string> = {
  button: "Button",
  image: "Image",
  card: "Card",
  review: "Review",
  faq: "Question",
  price: "Price row",
  text: "Text",
};

export function elementLabel(component: ContentComponent): string {
  const name = (component.label ?? component.link_label ?? "").trim();
  const kind = ELEMENT_LABEL[elementKindOf(component)];
  return name ? `${kind} · ${name.slice(0, 32)}` : kind;
}

/** "HOME → Hero → Primary CTA" for the selection breadcrumb. */
export function breadcrumb(
  page: ContentPage | null,
  section: ContentSection | null,
  component: ContentComponent | null,
): string[] {
  const trail: string[] = [];
  if (page) trail.push(page.title.toUpperCase());
  if (section) trail.push(sectionLabel(section.kind));
  if (component) trail.push(elementLabel(component));
  return trail;
}

/* ------------------------------- layers panel ------------------------------ */

export type LayerNode = {
  id: string;
  depth: 0 | 1;
  label: string;
  visible: boolean;
  selection: NonNullable<Selection>;
  /** Number of child elements, for the collapse affordance. */
  children: number;
};

export function layers(page: ContentPage | null): LayerNode[] {
  if (!page) return [];
  const nodes: LayerNode[] = [];
  for (const section of orderedSections(page)) {
    nodes.push({
      id: section.id,
      depth: 0,
      label: section.heading?.trim() || sectionLabel(section.kind),
      visible: section.is_visible,
      children: section.components.length,
      selection: { type: "section", pageId: page.id, sectionId: section.id },
    });
    for (const component of orderedComponents(section)) {
      nodes.push({
        id: component.id,
        depth: 1,
        label: elementLabel(component),
        visible: component.is_visible,
        children: 0,
        selection: {
          type: "component",
          pageId: page.id,
          sectionId: section.id,
          componentId: component.id,
        },
      });
    }
  }
  return nodes;
}

export const orderedSections = (page: ContentPage): ContentSection[] =>
  [...page.sections].sort((a, b) => a.sort_order - b.sort_order);

export const orderedComponents = (section: ContentSection): ContentComponent[] =>
  [...section.components].sort((a, b) => a.sort_order - b.sort_order);

/* ------------------------------- drag ordering ----------------------------- */

/**
 * The id order after dropping `dragId` before or after `overId`. Returns the
 * original order when the drag would not change anything, so no needless write
 * reaches the database.
 */
export function reorder(
  ids: string[],
  dragId: string,
  overId: string,
  position: "before" | "after",
): string[] {
  if (dragId === overId) return ids;
  const from = ids.indexOf(dragId);
  const overIndex = ids.indexOf(overId);
  if (from < 0 || overIndex < 0) return ids;
  const without = ids.filter((id) => id !== dragId);
  const target = without.indexOf(overId);
  const insertAt = position === "before" ? target : target + 1;
  const next = [...without.slice(0, insertAt), dragId, ...without.slice(insertAt)];
  return next.every((id, index) => id === ids[index]) ? ids : next;
}

/** Moves one id by a step, for the keyboard alternative to dragging. */
export function nudge(ids: string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/* -------------------------------- duplication ------------------------------ */

/**
 * The insert payload for a copy of a section — new row, same design and text,
 * placed immediately after the original. Database ids are never copied.
 */
export function duplicateSectionPayload(section: ContentSection, organizationId: string) {
  return {
    organization_id: organizationId,
    page_id: section.page_id,
    kind: section.kind,
    variant: section.variant,
    heading: section.heading,
    subheading: section.subheading,
    body: section.body,
    settings: (section.settings ?? {}) as never,
    sort_order: section.sort_order + 1,
    is_visible: section.is_visible,
  };
}

export function duplicateComponentPayload(
  component: ContentComponent,
  organizationId: string,
  sectionId = component.section_id,
) {
  return {
    organization_id: organizationId,
    section_id: sectionId,
    kind: component.kind,
    label: component.label,
    body: component.body,
    media_url: component.media_url,
    link_url: component.link_url,
    link_label: component.link_label,
    settings: (component.settings ?? {}) as never,
    sort_order: component.sort_order + 1,
    is_visible: component.is_visible,
  };
}

/* ----------------------------- element library ----------------------------- */

/** Elements a client can add inside a section, in plain language. */
export const COMPONENT_LIBRARY: {
  kind: string;
  label: string;
  help: string;
  defaults?: Partial<Pick<ContentComponent, "label" | "body" | "link_label" | "link_url">>;
}[] = [
  {
    kind: "button",
    label: "Button",
    help: "Sends visitors to a page, a phone call or your quote form.",
    defaults: { label: "Get a quote", link_url: "#quote" },
  },
  {
    kind: "custom",
    label: "Text block",
    help: "A short titled paragraph you write yourself.",
    defaults: { label: "New heading", body: "Say something useful here." },
  },
  {
    kind: "service_card",
    label: "Service card",
    help: "One service with its own description and link.",
    defaults: { label: "New service", body: "What this service includes." },
  },
  {
    kind: "benefit",
    label: "Reason to choose you",
    help: "One short reason customers pick you.",
    defaults: { label: "Why us", body: "Something you genuinely offer." },
  },
  {
    kind: "step",
    label: "Process step",
    help: "One step in how you work.",
    defaults: { label: "Step", body: "What happens at this stage." },
  },
  {
    kind: "faq_item",
    label: "Question & answer",
    help: "Answers a question before someone calls.",
    defaults: { label: "A common question", body: "Your answer." },
  },
  {
    kind: "price_row",
    label: "Price row",
    help: "A named starting price.",
    defaults: { label: "Service", body: "From $0" },
  },
  {
    kind: "trust_item",
    label: "Trust point",
    help: "Licensed, insured, years in business.",
    defaults: { label: "Fully insured" },
  },
  {
    kind: "gallery",
    label: "Image",
    help: "A photo of your work, with alt text.",
    defaults: { label: "Photo" },
  },
];

/* --------------------------- contextual toolbars --------------------------- */

export type ToolId =
  | "edit"
  | "ai"
  | "style"
  | "layout"
  | "link"
  | "replace"
  | "alt"
  | "duplicate"
  | "hide"
  | "delete"
  | "add";

export function sectionTools(): ToolId[] {
  return ["edit", "ai", "style", "layout", "add", "duplicate", "hide", "delete"];
}

export function componentTools(kind: ElementKind): ToolId[] {
  if (kind === "button") return ["edit", "link", "style", "ai", "duplicate", "hide", "delete"];
  if (kind === "image") return ["replace", "alt", "style", "duplicate", "hide", "delete"];
  return ["edit", "ai", "style", "duplicate", "hide", "delete"];
}

/* ------------------------------- AI addressing ----------------------------- */

/**
 * The instruction Revora's site agent receives. Naming the exact page, section
 * and element (and its database id) keeps an AI edit scoped to what the client
 * selected instead of rewriting the whole site.
 */
/** Preview tier used when the client asks AI to change what they are looking at. */
export type VisualEditDevice = "desktop" | "tablet" | "mobile";

/**
 * Builds a selection-aware visual-edit prompt. This is deliberately additive:
 * it gives the assistant hard scope and device context while leaving the
 * existing request planner and executor unchanged.
 */
export function visualEditInstruction(
  request: string,
  page: ContentPage | null,
  section: ContentSection | null,
  component: ContentComponent | null,
  device: VisualEditDevice = "desktop",
): string {
  const base = aiInstruction(request, page, section, component);
  if (!page && !section && !component) return base;

  const target = component ? "selected element" : section ? "selected section" : "selected page";
  const guidance = [
    "Visual edit mode is active.",
    "Preview device: " + device + ".",
    "Treat the " + target + " as the hard edit boundary. Do not rewrite unrelated pages, sections, or components.",
    "Preserve existing factual business details, links, and working functionality unless the request explicitly changes them.",
    "Prefer the smallest coherent set of native edits that makes the requested visual change obvious at the selected device size.",
  ];

  return [base, ...guidance].join("\n");
}

/** Contextual prompts shown beside a selected block; intentionally deterministic and editable. */
export function visualEditSuggestions(
  component: ContentComponent | null,
  section: ContentSection | null,
): string[] {
  if (component) {
    switch (elementKindOf(component)) {
      case "button":
        return ["Make this CTA stand out", "Improve this button copy", "Make this button feel more premium"];
      case "image":
        return ["Improve this image presentation", "Make this image fit the section better", "Improve this image alt text"];
      case "review":
        return ["Make this testimonial easier to trust", "Improve the review layout", "Make this review feel more premium"];
      case "faq":
        return ["Make this answer clearer", "Improve the FAQ presentation", "Make this question easier to scan"];
      default:
        return ["Make this more premium", "Improve this content hierarchy", "Make this easier to scan"];
    }
  }
  if (section) {
    return ["Make this section more premium", "Improve this section hierarchy", "Make this section convert better"];
  }
  return ["Make this page more polished", "Improve this page hierarchy", "Make this page easier to scan"];
}

export function aiInstruction(
  request: string,
  page: ContentPage | null,
  section: ContentSection | null,
  component: ContentComponent | null,
): string {
  const trail = breadcrumb(page, section, component);
  if (!trail.length) return request.trim();
  const target = component
    ? `component id ${component.id}`
    : section
      ? `section id ${section.id}`
      : page
        ? `page id ${page.id}`
        : "";
  return [
    `The client has selected: ${trail.join(" → ")}${target ? ` (${target})` : ""}.`,
    "Change only the selected element unless the request clearly asks for more.",
    `Request: ${request.trim()}`,
  ].join("\n");
}
