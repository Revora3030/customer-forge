import { describe, expect, it } from "vitest";
import { normalizeHeadingOutline } from "@/lib/builder/heading-outline";
import type { CompositionNode } from "@/lib/builder/composition-tree";

const h = (level: 1 | 2 | 3 | 4, text: string): CompositionNode => ({ type: "heading", level, text });
const stack = (...children: CompositionNode[]): CompositionNode => ({ type: "stack", children });
const levels = (roots: (CompositionNode | null)[]) => {
  const out: number[] = [];
  const walk = (n: CompositionNode) => { if (n.type === "heading") out.push(n.level ?? 2); (n.children ?? []).forEach(walk); };
  roots.forEach((r) => r && walk(r));
  return out;
};

describe("normalizeHeadingOutline (audit P1-08)", () => {
  it("keeps the first h1 and demotes every later one across sections", () => {
    const out = normalizeHeadingOutline([stack(h(1, "A"), h(2, "B")), stack(h(1, "C"), h(2, "D")), null, stack(h(1, "E"))]);
    expect(levels(out).filter((l) => l === 1)).toHaveLength(1);
    expect(levels(out)).toEqual([1, 2, 2, 2, 2]);
    expect(out[2]).toBeNull();
  });

  it("promotes the first heading when no section has an h1", () => {
    const out = normalizeHeadingOutline([stack(h(2, "Welcome"), h(3, "Sub")), stack(h(2, "More"))]);
    expect(levels(out)).toEqual([1, 2, 2]);
  });

  it("never skips a level", () => {
    const out = normalizeHeadingOutline([stack(h(1, "A"), h(4, "Deep"), h(3, "Mid"))]);
    const l = levels(out);
    expect(l).toEqual([1, 2, 3]);
    l.reduce((prev, cur) => { expect(cur - prev).toBeLessThanOrEqual(1); return cur; }, 0);
  });

  it("changes only levels, and leaves an already correct page as the same objects", () => {
    const roots = [stack(h(1, "A"), h(2, "B")), stack(h(2, "C"), h(3, "D"))];
    const out = normalizeHeadingOutline(roots);
    expect(out[0]).toBe(roots[0]);
    expect(out[1]).toBe(roots[1]);
    const input = [stack(h(1, "A")), stack(h(1, "B"))];
    const fixed = normalizeHeadingOutline(input);
    expect(input[1]!.children![0]!.level).toBe(1);
    expect(fixed[1]!.children![0]).toMatchObject({ level: 2, text: "B" });
  });

  it("ignores headings that render as a div and pages with no heading at all", () => {
    const wrapper: CompositionNode = { type: "heading", level: 1, text: "x", children: [{ type: "text", text: "block" }] };
    const out = normalizeHeadingOutline([stack(wrapper, h(2, "Real"))]);
    expect(levels(out)).toEqual([1, 1]);
    expect(normalizeHeadingOutline([stack({ type: "text", text: "p" })])).toHaveLength(1);
  });
});
