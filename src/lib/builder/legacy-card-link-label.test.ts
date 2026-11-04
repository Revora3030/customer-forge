import { describe, expect, it } from "vitest";
import { legacySectionToComposition } from "@/lib/builder/legacy-composition";
import { auditSectionDesign } from "@/lib/builder/design-quality";
import type { CompositionNode } from "@/lib/builder/composition-tree";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const walk = (node: CompositionNode): CompositionNode[] => [node, ...(node.children ?? []).flatMap(walk)];

describe("legacy card link label", () => {
  it("a card link with no saved label does not repeat the card title", () => {
    const tree = legacySectionToComposition({
      id: id(1),
      kind: "services",
      heading: "Our Services",
      components: [{ id: id(2), kind: "card", label: "Auto detailing", body: "Our main service.", link_url: "/services", link_label: null }],
    });
    expect(tree).not.toBeNull();
    const links = walk(tree!.root).filter((n) => n.type === "link");
    expect(links.map((l) => l.text)).toEqual(["See details"]);
    expect(auditSectionDesign(tree!, { lead: false, role: "services" }).map((f) => f.code)).not.toContain("action_label_is_heading");
  });

  it("a saved link label is kept as written", () => {
    const tree = legacySectionToComposition({
      id: id(3),
      kind: "services",
      heading: "Our Services",
      components: [{ id: id(4), kind: "card", label: "Driveway Cleaning", body: "Stains lifted.", link_url: "/driveways", link_label: "Book a clean" }],
    });
    expect(walk(tree!.root).filter((n) => n.type === "link").map((l) => l.text)).toEqual(["Book a clean"]);
  });
});
