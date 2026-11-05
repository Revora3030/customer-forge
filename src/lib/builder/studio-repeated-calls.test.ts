import { describe, expect, it } from "vitest";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { omitRepeatedCalls } from "./studio-canvas";

const button = (text: string): CompositionNode => ({ type: "button", text, href: "/contact" });
const headed = (title: string, extra: CompositionNode[] = []): CompositionNode => ({
  type: "stack",
  children: [{ type: "heading", level: 2, text: title }, ...extra, { type: "row", children: [button("Send a message")] }],
});

describe("studio page repeated calls", () => {
  it("drops the row a removed copy leaves empty", () => {
    const kept = omitRepeatedCalls([headed("A", [{ type: "text", text: "Words." }]), headed("B", [{ type: "text", text: "More." }]), headed("C", [{ type: "text", text: "Yet more." }])]);
    expect(kept[0]?.children?.map((c) => c.type)).toEqual(["heading", "text", "row"]);
    expect(kept[1]?.children?.map((c) => c.type)).toEqual(["heading", "text"]);
    expect(kept[2]?.children?.map((c) => c.type)).toEqual(["heading", "text"]);
  });

  it("never leaves a section as one bare heading", () => {
    const kept = omitRepeatedCalls([headed("A"), headed("B"), headed("C")]);
    for (const root of kept) expect(JSON.stringify(root)).toContain("Send a message");
  });
});
