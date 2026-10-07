import { describe, expect, it } from "vitest";
import { validateComposition } from "@/lib/builder/composition-tree";
import { LEGACY_SECTION_KINDS, legacySectionToComposition } from "@/components/site/site-sections-utils";

describe("legacy section composition adapter", () => {
  it("converts a legacy hero into the same CompositionTree contract", () => {
    const section = {
      id: "section-hero",
      kind: "hero",
      heading: "A brighter home",
      subheading: "Exterior cleaning for local homeowners.",
      body: null,
      settings: { bgColor: "#12151a" },
      components: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          kind: "image",
          label: "Freshly washed exterior",
          body: null,
          media_url: "https://cdn.example.com/hero.jpg",
          url: "https://cdn.example.com/hero.jpg",
          link_url: null,
          link_label: null,
          settings: {},
        },
        {
          id: "button-1",
          kind: "button",
          label: "Get a quote",
          body: null,
          media_url: null,
          url: null,
          link_url: "/contact",
          link_label: "Get a quote",
          settings: {},
        },
      ],
    } as never;

    const tree = legacySectionToComposition(section, {
      lead: true,
      surface: "#12151a",
      accent: "#c89f45",
    });

    expect(tree).not.toBeNull();
    expect(tree?.root.type).toBe("stack");
    expect(LEGACY_SECTION_KINDS.has("hero")).toBe(true);

    const checked = validateComposition(tree, {
      allowedMediaRefs: new Set(["11111111-1111-1111-1111-111111111111"]),
      requiredMediaRefs: new Set(["11111111-1111-1111-1111-111111111111"]),
    });
    expect(checked.ok).toBe(true);
  });

  it("preserves legacy cards while upgrading them to a responsive bento-style grid", () => {
    const section = {
      id: "section-services",
      kind: "services",
      heading: "Services",
      subheading: null,
      body: null,
      settings: { bgColor: "#f3f1ec" },
      components: [
        {
          id: "card-1",
          kind: "card",
          label: "Driveway Cleaning",
          body: "Low-pressure exterior cleaning.",
          media_url: null,
          link_url: "/contact",
          link_label: "Ask about availability",
          settings: {},
        },
        {
          id: "card-2",
          kind: "card",
          label: "Roof Cleaning",
          body: "Roof-safe cleaning process.",
          media_url: null,
          link_url: "/contact",
          link_label: "Ask about availability",
          settings: {},
        },
        {
          id: "card-3",
          kind: "card",
          label: "Deck Restoration",
          body: "Restore the finish and appearance.",
          media_url: null,
          link_url: "/contact",
          link_label: "Ask about availability",
          settings: {},
        },
      ],
    } as never;

    const tree = legacySectionToComposition(section, { surface: "#f3f1ec", accent: "#184f46" });
    expect(tree?.root.type).toBe("stack");
    const grid = tree?.root.children?.find((child) => child.type === "grid");
    expect(grid?.type).toBe("grid");
    expect(grid?.style?.columns).toBe(3);
    expect(grid?.responsive?.mobile?.columns).toBe(1);

    const checked = validateComposition(tree);
    expect(checked.ok).toBe(true);
  });

  it("returns null for section kinds that are functional or unknown", () => {
    expect(legacySectionToComposition({ id: "quote", kind: "quote", components: [], settings: {} } as never)).toBeNull();
    expect(legacySectionToComposition({ id: "x", kind: "unknown", components: [], settings: {} } as never)).toBeNull();
  });
});
