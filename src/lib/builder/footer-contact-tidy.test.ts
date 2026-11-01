import { describe, expect, it } from "vitest";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { countFooterContact, tidyFooterContact } from "./footer-contact-tidy";

const n = (node: Partial<CompositionNode> & { type: CompositionNode["type"] }) => node as CompositionNode;
const tree = (root: CompositionNode): CompositionTree => ({ version: 1, root }) as CompositionTree;

const repeated = tree(
  n({
    type: "stack",
    style: { gap: 120 },
    children: [
      n({ type: "text", text: "Elite Mobile Detail" }),
      n({ type: "link", text: "(919) 867-5309", href: "tel:+19198675309" }),
      n({ type: "spacer" }),
      n({ type: "stack", children: [
        n({ type: "text", text: "Call us:" }),
        n({ type: "link", text: "(919) 867-5309", href: "tel:+19198675309" }),
        n({ type: "text", text: "Email:" }),
        n({ type: "link", text: "hello@elite.co", href: "mailto:hello@elite.co" }),
      ] }),
      n({ type: "row", children: [
        n({ type: "link", text: "Call now", href: "tel:+19198675309" }),
        n({ type: "link", text: "hello@elite.co", href: "mailto:hello@elite.co" }),
      ] }),
    ],
  }),
);

describe("tidyFooterContact", () => {
  it("shows the phone and the email once, drops spacers and orphan labels, caps gaps", () => {
    expect(countFooterContact(repeated)).toEqual({ phone: 3, email: 2 });
    const out = tidyFooterContact(repeated);
    expect(countFooterContact(out)).toEqual({ phone: 1, email: 1 });
    const json = JSON.stringify(out);
    expect(json).not.toContain('"spacer"');
    expect(json).not.toContain("Call us:");
    expect(out.root.style?.gap).toBe(40);
    expect(json).toContain("Elite Mobile Detail");
  });
  it("leaves a footer with no repeats unchanged apart from spacers", () => {
    const clean = tree(n({ type: "stack", children: [n({ type: "text", text: "Hi" }), n({ type: "link", text: "About", href: "/about" })] }));
    expect(tidyFooterContact(clean)).toEqual(clean);
  });
});
