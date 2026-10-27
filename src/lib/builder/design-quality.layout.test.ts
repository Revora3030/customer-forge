import { describe, expect, it } from "vitest";
import { auditPageDesign, needsDesignRepair } from "@/lib/builder/design-quality";
import type { CompositionTree } from "@/lib/builder/composition-tree";

const tree = (root: CompositionTree["root"]): CompositionTree => ({ version: 1, root });
const line = "Showroom-grade detailing delivered right to your driveway every time.";
const codes = (out: ReturnType<typeof auditPageDesign>, id: string) => (out[id] ?? []).map((f) => f.code);

describe("page layout checks", () => {
  it("flags the same sentence repeated on one page and sends it back", () => {
    const out = auditPageDesign([
      { id: "a", role: "hero", tree: tree({ type: "stack", children: [{ type: "text", text: line }] }) },
      { id: "b", role: "services", tree: tree({ type: "stack", children: [{ type: "text", text: line }] }) },
    ] as never);
    expect(codes(out, "b")).toContain("duplicate_text");
    expect(codes(out, "a")).not.toContain("duplicate_text");
    expect(needsDesignRepair(out["b"]!)).toBe(true);
  });

  it("flags a blank column in a multi-column grid", () => {
    const out = auditPageDesign([
      { id: "a", role: "about", tree: tree({ type: "grid", children: [{ type: "text", text: "Our story" }, { type: "stack", children: [] }] }) },
    ] as never);
    expect(codes(out, "a")).toContain("empty_column");
  });

  it("does not flag a grid where every column has content", () => {
    const out = auditPageDesign([
      { id: "a", role: "about", tree: tree({ type: "grid", children: [{ type: "text", text: "Our story" }, { type: "image", mediaRef: "m1" }] }) },
    ] as never);
    expect(codes(out, "a")).not.toContain("empty_column");
  });
});
