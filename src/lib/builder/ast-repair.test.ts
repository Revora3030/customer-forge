import { describe, expect, it } from "vitest";
import {
  applyRepairEdits,
  applySectionEdits,
  changedPaths,
  findNodes,
  nodeAt,
  onlyEditedChanged,
  parsePath,
  parseRepairEdits,
} from "./ast-repair";
import type { CompositionTree } from "./composition-tree";

const tree: CompositionTree = {
  version: 1,
  root: {
    type: "stack",
    children: [
      {
        type: "stack",
        children: [
          { type: "heading", level: 1, text: "Fresh cuts in Raleigh" },
          { type: "button", text: "Book now", href: "/book", style: { background: "#111111", color: "#ffffff" } },
        ],
      },
      {
        type: "stack",
        children: [
          { type: "heading", level: 2, text: "Services" },
          { type: "button", text: "Book now", href: "/book", style: { background: "#111111", color: "#ffffff" } },
        ],
      },
    ],
  },
};

describe("BRF-01 AST-precise repair", () => {
  it("parses only well-formed node paths", () => {
    expect(parsePath("root")).toEqual([]);
    expect(parsePath("root.children[1].children[0]")).toEqual([1, 0]);
    expect(parsePath("root.children[x]")).toBeNull();
    expect(parsePath("root.__proto__")).toBeNull();
  });

  it("finds the exact node structurally (the hero button, not the other one)", () => {
    const all = findNodes(tree, { type: "button", text: "book" });
    expect(all.map((m) => m.path)).toEqual(["root.children[0].children[1]", "root.children[1].children[1]"]);
    const hero = findNodes(tree, { type: "button", inside: { type: "stack" } }).filter((m) =>
      m.path.startsWith("root.children[0]"),
    );
    expect(hero).toHaveLength(1);
    expect(findNodes(tree, { href: "/book" })).toHaveLength(2);
  });

  it("changes only the text and colour of the hero button and keeps its click action", () => {
    const path = "root.children[0].children[1]";
    const result = applyRepairEdits(tree, [
      { op: "set", path, field: "text", value: "Get My Free Estimate" },
      { op: "style", path, style: { background: "#d4af37", color: "#111111" } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const button = nodeAt(result.tree, path)!;
    expect(button).toEqual({ type: "button", text: "Get My Free Estimate", href: "/book", style: { background: "#d4af37", color: "#111111" } });
    // Everything else is untouched, by identity, not just by value.
    expect(result.tree.root.children![1]).toBe(tree.root.children![1]);
    expect(result.tree.root.children![0]!.children![0]).toBe(tree.root.children![0]!.children![0]);
    expect(changedPaths(tree.root, result.tree.root)).toEqual([path]);
    expect(onlyEditedChanged(tree, result.tree, [{ op: "remove", path }])).toBe(true);
    expect(result.changes.map((c) => c.what)).toEqual(["text", "style.background", "style.color"]);
    // The input tree is never mutated.
    expect(nodeAt(tree, path)!.text).toBe("Book now");
  });

  it("re-validates: gold behind white text fails the contrast gate, so nothing lands", () => {
    const result = applyRepairEdits(tree, [{ op: "style", path: "root.children[0].children[1]", style: { background: "#d4af37" } }]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]).toMatch(/contrast/);
  });

  it("keeps a CTA's href when relabelling it", () => {
    const withCta: CompositionTree = {
      version: 1,
      root: { type: "mobile_sticky_bar", primaryCta: { label: "Call", href: "tel:+19195550100" } },
    };
    const result = applyRepairEdits(withCta, [{ op: "cta_label", path: "root", slot: "primaryCta", label: "Call us" }], {});
    expect(result.ok ? null : result.problems).toBeNull();
    if (result.ok) expect(result.tree.root.primaryCta).toEqual({ label: "Call us", href: "tel:+19195550100" });
    const missing = applyRepairEdits(withCta, [{ op: "cta_label", path: "root", slot: "secondaryCta", label: "x" }]);
    expect(missing.ok).toBe(false);
  });

  it("inserts and removes precisely", () => {
    const inserted = applyRepairEdits(tree, [
      { op: "insert", path: "root.children[1]", index: 1, node: { type: "text", text: "From $35" } },
    ]);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(nodeAt(inserted.tree, "root.children[1].children[1]")!.text).toBe("From $35");
    expect(changedPaths(tree.root, inserted.tree.root)).toEqual(["root.children[1]"]);
    const removed = applyRepairEdits(tree, [{ op: "remove", path: "root.children[1].children[1]" }]);
    expect(removed.ok && removed.tree.root.children![1]!.children).toHaveLength(1);
  });

  it("fails the whole repair (no partial tree) on a bad edit or an invalid result", () => {
    const bad = applyRepairEdits(tree, [
      { op: "set", path: "root.children[0].children[1]", field: "text", value: "OK" },
      { op: "set", path: "root.children[9]", field: "text", value: "nope" },
    ]);
    expect(bad).toEqual({ ok: false, problems: ["edit 2 (set root.children[9]): no node at that path"] });
    expect(applyRepairEdits(tree, [{ op: "remove", path: "root" }]).ok).toBe(false);
    const unsafe = applyRepairEdits(tree, [{ op: "set", path: "root.children[0].children[1]", field: "href", value: "javascript:alert(1)" }]);
    expect(unsafe.ok).toBe(false);
    expect(applyRepairEdits(tree, [{ op: "replace", path: "root.children[0]", node: { type: "evil" as never } }]).ok).toBe(false);
  });

  it("parses AI edit replies and drops malformed ones", () => {
    const { edits, rejected } = parseRepairEdits({
      edits: [
        { op: "set", path: "root.children[0]", field: "text", value: "Hi" },
        { op: "set", path: "root.children[0]", field: "type", value: "widget" },
        { op: "rewrite_page", path: "root" },
        { op: "cta_label", path: "root", slot: "primaryCta", label: "Go" },
      ],
    });
    expect(edits.map((e) => e.op)).toEqual(["set", "cta_label"]);
    expect(rejected).toBe(2);
    expect(parseRepairEdits("junk")).toEqual({ edits: [], rejected: 0 });
  });

  it("applies per-section edits; failed or unknown sections keep their current tree", () => {
    const current = { hero: tree, other: tree };
    const out = applySectionEdits(current, {
      edits: {
        hero: [{ op: "set", path: "root.children[0].children[0]", field: "text", value: "Sharp cuts" }],
        other: [{ op: "set", path: "root.children[7]", field: "text", value: "x" }],
        ghost: [{ op: "remove", path: "root.children[0]" }],
      },
    })!;
    expect(out.applied).toBe(1);
    expect(out.failed).toBe(1);
    expect(nodeAt(out.trees["hero"] as CompositionTree, "root.children[0].children[0]")!.text).toBe("Sharp cuts");
    expect(out.trees["other"]).toBe(tree);
    expect("ghost" in out.trees).toBe(false);
    expect(applySectionEdits(current, { sections: {} })).toBeNull();
  });
});
