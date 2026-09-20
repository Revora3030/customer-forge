import { describe, expect, it } from "vitest";
import {
  describeFreeformBlock,
  evaluateExpr,
  freeformInitialValues,
  isConditionExpr,
  parseFreeformBlock,
  type FreeformSpec,
} from "./freeform";
import { parseCustomBlock } from "./custom-block";

function ok(raw: unknown): FreeformSpec {
  const result = parseFreeformBlock(raw);
  if (!result.ok) throw new Error(`expected a valid block, got: ${result.reason}`);
  return result.spec;
}

const crewPanel = {
  type: "freeform",
  title: "Plan your visit",
  note: "Crew size and visit length are a guide — we confirm after a quick look.",
  root: [
    {
      node: "grid",
      columns: 2,
      gap: 4,
      children: [
        {
          node: "card",
          tone: "surface",
          children: [
            { node: "heading", level: 3, text: "Your space" },
            { node: "field", id: "rooms", kind: "number", label: "Rooms", min: 1, max: 12, step: 1, value: 3 },
            {
              node: "field",
              id: "depth",
              kind: "select",
              label: "How deep a clean?",
              options: [
                { label: "Regular", value: 30 },
                { label: "Deep", value: 55 },
              ],
            },
            { node: "field", id: "pets", kind: "toggle", label: "Pets at home?", value: 0 },
          ],
        },
        {
          node: "card",
          tone: "accent",
          children: [
            {
              node: "value",
              label: "Visit length",
              format: "duration",
              expr: {
                op: "add",
                args: [
                  { op: "mul", args: [{ op: "ref", id: "rooms" }, { op: "ref", id: "depth" }] },
                  { op: "mul", args: [{ op: "ref", id: "pets" }, 20] },
                ],
              },
            },
            {
              node: "when",
              expr: { op: "gt", args: [{ op: "ref", id: "rooms" }, 6] },
              children: [{ node: "badge", tone: "attention", text: "Two-person crew" }],
            },
            { node: "link", text: "Ask for a time", href: "#contact", variant: "primary" },
          ],
        },
      ],
    },
  ],
};

describe("free-form blocks", () => {
  it("accepts a layout with inputs, a live figure and a conditional part", () => {
    const spec = ok(crewPanel);
    expect(spec.type).toBe("freeform");
    expect(spec.root).toHaveLength(1);
    expect(describeFreeformBlock(spec)).toContain("3 visitor inputs");
    expect(describeFreeformBlock(spec)).toContain("1 live figure");
  });

  it("flows through the shared block parser so apply and rollback cover it", () => {
    const result = parseCustomBlock(crewPanel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.type).toBe("freeform");
  });

  it("starts every input at its declared value", () => {
    const values = freeformInitialValues(ok(crewPanel).root);
    expect(values).toEqual({ rooms: 3, depth: 30, pets: 0 });
  });

  it("works out figures from the visitor's choices", () => {
    const spec = ok(crewPanel);
    const card = spec.root[0];
    if (card?.node !== "grid") throw new Error("expected a grid");
    const right = card.children[1];
    if (right?.node !== "card") throw new Error("expected a card");
    const readout = right.children[0];
    if (readout?.node !== "value") throw new Error("expected a readout");
    expect(evaluateExpr(readout.expr, { rooms: 3, depth: 30, pets: 0 })).toBe(90);
    expect(evaluateExpr(readout.expr, { rooms: 4, depth: 55, pets: 1 })).toBe(240);
  });

  it("treats comparisons as yes/no tests and sums as figures", () => {
    expect(isConditionExpr({ op: "gt", args: [1, 2].map((value) => ({ op: "num", value })) })).toBe(true);
    expect(isConditionExpr({ op: "add", args: [1, 2].map((value) => ({ op: "num", value })) })).toBe(false);
  });

  it("never divides by zero", () => {
    expect(evaluateExpr({ op: "div", args: [{ op: "num", value: 9 }, { op: "num", value: 0 }] }, {})).toBe(0);
  });

  it("requires a guide note when a figure is worked out", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      root: [
        { node: "field", id: "hours", kind: "number", label: "Hours", min: 1, max: 8, step: 1, value: 2 },
        { node: "value", label: "Total", format: "currency", expr: { op: "mul", args: [{ op: "ref", id: "hours" }, 60] } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("guide");
  });

  it("rejects a readout that points at an input the block does not have", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      note: "Guide only.",
      root: [{ node: "value", label: "Total", format: "number", expr: { op: "ref", id: "missing" } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("does not exist");
  });

  it("rejects unknown layout parts and unknown calculation steps", () => {
    const badNode = parseFreeformBlock({ type: "freeform", root: [{ node: "script", text: "hi" }] });
    expect(badNode.ok).toBe(false);
    if (!badNode.ok) expect(badNode.reason).toContain("unknown layout part");

    const badExpr = parseFreeformBlock({
      type: "freeform",
      note: "Guide only.",
      root: [
        { node: "field", id: "a", kind: "number", label: "A", min: 0, max: 9, step: 1, value: 1 },
        { node: "value", label: "Total", format: "number", expr: { op: "fetch", args: [{ op: "ref", id: "a" }] } },
      ],
    });
    expect(badExpr.ok).toBe(false);
    if (!badExpr.ok) expect(badExpr.reason).toContain("unknown calculation step");
  });

  it("refuses markup, script schemes and unfinished template text", () => {
    for (const text of ["<b>bold</b>", "javascript:alert(1)", "Hello {{name}}"]) {
      const result = parseFreeformBlock({ type: "freeform", root: [{ node: "text", text }] });
      expect(result.ok).toBe(false);
    }
  });

  it("refuses unsafe button addresses and keeps safe ones", () => {
    const unsafe = parseFreeformBlock({
      type: "freeform",
      root: [{ node: "link", text: "Tap", href: "javascript:alert(1)" }],
    });
    expect(unsafe.ok).toBe(false);

    const safe = ok({
      type: "freeform",
      root: [{ node: "link", text: "Email us", href: "mailto:hello@example.com" }],
    });
    const link = safe.root[0];
    if (link?.node !== "link") throw new Error("expected a link");
    expect(link.href).toBe("mailto:hello@example.com");
  });

  it("insists every picture carries a description", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      root: [{ node: "image", src: "https://example.com/a.jpg", alt: "" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("screen readers");
  });

  it("caps runaway layouts instead of shipping them", () => {
    const deep = (depth: number): unknown =>
      depth === 0
        ? { node: "text", text: "leaf" }
        : { node: "stack", direction: "column", gap: 2, children: [deep(depth - 1)] };
    const tooDeep = parseFreeformBlock({ type: "freeform", root: [deep(12)] });
    expect(tooDeep.ok).toBe(false);
    if (!tooDeep.ok) expect(tooDeep.reason).toContain("nested too deeply");

    const wide = parseFreeformBlock({
      type: "freeform",
      root: [
        {
          node: "stack",
          direction: "column",
          gap: 2,
          children: Array.from({ length: 40 }, () => ({ node: "text", text: "row" })),
        },
      ],
    });
    expect(wide.ok).toBe(false);
  });

  it("caps the number of visitor inputs", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      root: Array.from({ length: 14 }, (_unused, index) => ({
        node: "field",
        id: `f${index}`,
        kind: "toggle",
        label: `Question ${index + 1}`,
      })),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("visitor inputs");
  });

  it("rejects duplicate input names so figures cannot be ambiguous", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      root: [
        { node: "field", id: "rooms", kind: "toggle", label: "Rooms" },
        { node: "field", id: "rooms", kind: "toggle", label: "Rooms again" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("share the name");
  });

  it("keeps a conditional part as a yes/no test only", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      root: [
        { node: "field", id: "a", kind: "number", label: "A", min: 0, max: 9, step: 1, value: 1 },
        { node: "when", expr: { op: "add", args: [{ op: "ref", id: "a" }, 1] }, children: [{ node: "divider" }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("yes/no test");
  });

  it("rejects an empty container rather than rendering a blank box", () => {
    const result = parseFreeformBlock({
      type: "freeform",
      root: [{ node: "card", tone: "surface", children: [] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("at least one child");
  });
});
