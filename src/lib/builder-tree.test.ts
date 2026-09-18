import { describe, expect, it } from "vitest";
import {
  aiInstruction,
  visualEditInstruction,
  visualEditSuggestions,
  breadcrumb,
  componentTools,
  duplicateComponentPayload,
  duplicateSectionPayload,
  elementKindOf,
  elementLabel,
  layers,
  nudge,
  reorder,
  sameSelection,
} from "@/lib/builder-tree";
import type { ContentComponent, ContentPage, ContentSection } from "@/lib/website-content";

const component = (over: Partial<ContentComponent> = {}): ContentComponent => ({
  id: "c1",
  section_id: "s1",
  kind: "button",
  label: "Get a quote",
  body: null,
  media_url: null,
  link_url: "#quote",
  link_label: "Get a quote",
  settings: {},
  sort_order: 0,
  is_visible: true,
  ...over,
});

const section = (over: Partial<ContentSection> = {}): ContentSection => ({
  id: "s1",
  page_id: "p1",
  kind: "hero",
  variant: "default",
  heading: "Fast local plumbers",
  subheading: null,
  body: null,
  settings: {},
  sort_order: 0,
  is_visible: true,
  components: [component()],
  ...over,
});

const page = (over: Partial<ContentPage> = {}): ContentPage => ({
  id: "p1",
  slug: "home",
  title: "Home",
  kind: "home",
  sort_order: 0,
  is_visible: true,
  seo_title: null,
  seo_description: null,
  seo_canonical: null,
  og_title: null,
  og_description: null,
  og_image_url: null,
  noindex: false,
  sections: [section()],
  ...over,
});

describe("selection", () => {
  it("treats identical targets as the same selection", () => {
    const a = { type: "component", pageId: "p1", sectionId: "s1", componentId: "c1" } as const;
    expect(sameSelection(a, { ...a })).toBe(true);
    expect(sameSelection(a, { type: "section", pageId: "p1", sectionId: "s1" })).toBe(false);
    expect(sameSelection(null, null)).toBe(true);
  });
});

describe("element naming", () => {
  it("classifies elements so the right toolbar shows", () => {
    expect(elementKindOf(component())).toBe("button");
    expect(elementKindOf(component({ kind: "faq_item" }))).toBe("faq");
    expect(elementKindOf(component({ kind: "gallery" }))).toBe("image");
    expect(elementKindOf(component({ kind: "service_card" }))).toBe("card");
    expect(elementKindOf(component({ kind: "custom", link_url: null }))).toBe("text");
  });

  it("labels an element with its type and its own text", () => {
    expect(elementLabel(component())).toBe("Button · Get a quote");
    expect(elementLabel(component({ label: null, link_label: null }))).toBe("Button");
  });

  it("offers image tools only for images", () => {
    expect(componentTools("image")).toContain("alt");
    expect(componentTools("button")).toContain("link");
    expect(componentTools("text")).not.toContain("alt");
  });
});

describe("breadcrumb and layers", () => {
  it("names the full path to the selected element", () => {
    expect(breadcrumb(page(), section(), component())).toEqual([
      "HOME",
      "Headline banner",
      "Button · Get a quote",
    ]);
  });

  it("flattens the page into a two-level layer list", () => {
    const nodes = layers(page());
    expect(nodes.map((node) => node.depth)).toEqual([0, 1]);
    expect(nodes[0]!.label).toBe("Fast local plumbers");
    expect(nodes[0]!.children).toBe(1);
    expect(nodes[1]!.selection).toEqual({
      type: "component",
      pageId: "p1",
      sectionId: "s1",
      componentId: "c1",
    });
  });

  it("returns nothing when no page is selected", () => {
    expect(layers(null)).toEqual([]);
  });
});

describe("drag ordering", () => {
  const ids = ["a", "b", "c", "d"];

  it("drops before and after the hovered row", () => {
    expect(reorder(ids, "d", "b", "before")).toEqual(["a", "d", "b", "c"]);
    expect(reorder(ids, "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
  });

  it("returns the original array when nothing moves", () => {
    expect(reorder(ids, "a", "a", "before")).toBe(ids);
    expect(reorder(ids, "a", "b", "before")).toBe(ids);
    expect(reorder(ids, "missing", "b", "after")).toBe(ids);
  });

  it("nudges one row and refuses to fall off either end", () => {
    expect(nudge(ids, "b", -1)).toEqual(["b", "a", "c", "d"]);
    expect(nudge(ids, "a", -1)).toBe(ids);
    expect(nudge(ids, "d", 1)).toBe(ids);
  });
});

describe("duplication", () => {
  it("copies content but never the database id", () => {
    const payload = duplicateSectionPayload(section(), "org-1");
    expect(payload).not.toHaveProperty("id");
    expect(payload.organization_id).toBe("org-1");
    expect(payload.sort_order).toBe(1);
    expect(payload.heading).toBe("Fast local plumbers");
  });

  it("re-parents a copied element when asked", () => {
    const payload = duplicateComponentPayload(component(), "org-1", "s2");
    expect(payload).not.toHaveProperty("id");
    expect(payload.section_id).toBe("s2");
    expect(payload.link_url).toBe("#quote");
  });
});

describe("AI addressing", () => {
  it("scopes the request to the selected element and its id", () => {
    const instruction = aiInstruction("make this gold", page(), section(), component());
    expect(instruction).toContain("HOME → Headline banner → Button · Get a quote");
    expect(instruction).toContain("component id c1");
    expect(instruction).toContain("Change only the selected element");
    expect(instruction).toContain("make this gold");
  });

  it("passes a bare request through when nothing is selected", () => {
    expect(aiInstruction(" add a booking page ", null, null, null)).toBe("add a booking page");
  });

  it("adds hard visual-edit scope and device context", () => {
    const instruction = visualEditInstruction("make this cleaner", page(), section(), component(), "mobile");
    expect(instruction).toContain("Visual edit mode is active.");
    expect(instruction).toContain("Preview device: mobile.");
    expect(instruction).toContain("hard edit boundary");
    expect(instruction).toContain("make this cleaner");
  });

  it("offers deterministic suggestions for the selected element", () => {
    expect(visualEditSuggestions(component(), section())).toContain("Make this CTA stand out");
    expect(visualEditSuggestions(component({ kind: "gallery" }), section())).toContain(
      "Improve this image presentation",
    );
    expect(visualEditSuggestions(null, section())).toContain("Make this section more premium");
  });

});
