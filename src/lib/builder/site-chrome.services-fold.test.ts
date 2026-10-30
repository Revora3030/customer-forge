import { describe, expect, it } from "vitest";
import { foldHeaderSubmenus, foldServicePages, menuItems, servicePagesOf } from "@/lib/builder/site-chrome";
import type { CompositionTree } from "@/lib/builder/composition-tree";

const nav = [
  { slug: "home", title: "Home", kind: "home" },
  { slug: "services", title: "Services", kind: "services" },
  { slug: "drain-cleaning", title: "Drain Cleaning", kind: "custom" },
  { slug: "water-heaters", title: "Water Heaters", kind: "service" },
  { slug: "leak-repair", title: "Leak Repair", kind: "custom" },
  { slug: "about", title: "About", kind: "about" },
  { slug: "book", title: "Book", kind: "custom" },
];
const link = (text: string, href: string) => ({ type: "link" as const, text, href });
const header = (): CompositionTree => ({
  version: 1,
  root: {
    type: "row",
    children: [
      link("Oak City Plumbing", "/"),
      { type: "row", children: [link("Home", "/"), link("Services", "/services"), link("Drain Cleaning", "/drain-cleaning"), link("Water Heaters", "/water-heaters"), link("Leak Repair", "/leak-repair"), link("About", "/about"), link("Book", "/book")] },
      { type: "button", text: "Request Service", href: "/book" },
    ],
  },
} as CompositionTree);

describe("flat service pages fold under the Services menu link", () => {
  it("finds the hub and the single-service pages, never the standard ones", () => {
    const found = servicePagesOf(nav);
    expect(found.hub).toBe("services");
    expect(found.services.map((s) => s.slug)).toEqual(["drain-cleaning", "water-heaters", "leak-repair"]);
  });

  it("turns the menu into one Services dropdown (the Oak City Plumbing bar)", () => {
    const { tree, folded } = foldServicePages(header(), nav);
    expect([...folded]).toEqual(["drain-cleaning", "water-heaters", "leak-repair"]);
    const items = menuItems(foldHeaderSubmenus(tree));
    expect(items.map((i) => [i.label, i.depth])).toEqual([
      ["Oak City Plumbing", 0], ["Home", 0], ["Services", 0],
      ["Drain Cleaning", 1], ["Water Heaters", 1], ["Leak Repair", 1],
      ["About", 0], ["Book", 0], ["Request Service", 0],
    ]);
  });

  it("adds service pages the menu forgot to the dropdown", () => {
    const tree = header();
    const bar = tree.root.children![1]!;
    bar.children = bar.children!.filter((n) => n.href !== "/leak-repair");
    const out = foldServicePages(tree, nav, [{ slug: "leak-repair", title: "Leak Repair" }]);
    expect(out.folded.has("leak-repair")).toBe(true);
    const hub = out.tree.root.children![1]!.children!.find((n) => n.text === "Services")!;
    expect(hub.children!.map((n) => n.href)).toEqual(["/drain-cleaning", "/water-heaters", "/leak-repair"]);
  });

  it("uses the menu's Services label when no page is marked as the hub", () => {
    const loose = nav.map((p) => (p.kind === "services" ? { ...p, slug: "plumbing-services", kind: "custom" } : p));
    const tree = header();
    tree.root.children![1]!.children![1] = link("Services", "/plumbing-services");
    const { folded } = foldServicePages(tree, loose);
    expect(folded.size).toBe(3);
  });

  it("leaves the menu alone without a Services link or with one service", () => {
    const tree = header();
    tree.root.children![1]!.children = tree.root.children![1]!.children!.filter((n) => n.text !== "Services");
    expect(foldServicePages(tree, nav).tree).toBe(tree);
    const one = nav.filter((p) => p.slug !== "water-heaters" && p.slug !== "leak-repair");
    const t2 = header();
    expect(foldServicePages(t2, one).tree).toBe(t2);
  });
});
