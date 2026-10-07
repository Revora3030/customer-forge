import { describe, expect, it } from "vitest";
import { legacySectionToComposition } from "./legacy-composition";
import { validateComposition, type CompositionNode } from "./composition-tree";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function walk(node: CompositionNode, out: CompositionNode[] = []): CompositionNode[] {
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

describe("legacySectionToComposition", () => {
  it("turns an old hero into a valid composition tree using only its own content", () => {
    const tree = legacySectionToComposition(
      {
        id: id(1),
        kind: "hero",
        heading: "Elite Pressure Washing",
        subheading: "Driveways, siding and roofs in Raleigh",
        body: null,
        components: [
          { id: id(2), kind: "hero_image", url: "https://example.com/a.jpg", label: "Clean driveway" },
          { id: id(3), kind: "button", link_url: "/contact", link_label: "Get a quote" },
        ],
      },
      { lead: true },
    );
    expect(tree).not.toBeNull();
    const result = validateComposition(tree, { allowedMediaRefs: new Set([id(2)]) });
    expect(result.ok).toBe(true);
    const nodes = walk(tree!.root);
    expect(nodes.filter((n) => n.type === "heading" && n.level === 1).map((n) => n.text)).toEqual(["Elite Pressure Washing"]);
    expect(nodes.some((n) => n.type === "media" && n.mediaRef === id(2))).toBe(true);
    expect(nodes.some((n) => n.type === "button" && n.href === "/contact" && n.text === "Get a quote")).toBe(true);
    // No colour is chosen by the adapter: the site theme decides.
    expect(nodes.some((n) => n.style?.color || n.style?.background)).toBe(false);
  });

  it("lays services out as a responsive card grid", () => {
    const tree = legacySectionToComposition({
      id: id(4),
      kind: "services",
      heading: "Services",
      components: [
        { id: id(5), kind: "card", label: "Driveway Cleaning", body: "Oil and rust stains lifted." },
        { id: id(6), kind: "card", label: "House Soft Washing", body: "Low-pressure siding wash." },
        { id: id(7), kind: "card", label: "Roof Cleaning", body: "Black streak removal." },
      ],
    });
    expect(validateComposition(tree).ok).toBe(true);
    const grid = walk(tree!.root).find((n) => n.type === "grid");
    expect(grid?.style?.columns).toBe(3);
    expect(grid?.responsive?.mobile?.columns).toBe(1);
    expect(grid?.children?.length).toBe(3);
  });

  it("renders nothing for an empty section and ignores non-legacy kinds", () => {
    expect(legacySectionToComposition({ id: id(8), kind: "hero", heading: "", components: [] })).toBeNull();
    expect(legacySectionToComposition({ id: id(9), kind: "contact", heading: "Contact" })).toBeNull();
  });

  it("drops unsafe links instead of rendering them", () => {
    const tree = legacySectionToComposition({
      id: id(1),
      kind: "page",
      heading: "About",
      components: [{ id: id(2), kind: "button", link_url: "javascript:alert(1)", link_label: "Click" }],
    });
    expect(walk(tree!.root).some((n) => n.type === "button")).toBe(false);
  });
});
