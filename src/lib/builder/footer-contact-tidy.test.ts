import { describe, expect, it } from "vitest";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { countFooterContact, tidyContactSections, tidyFooterContact } from "./footer-contact-tidy";

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
    expect(countFooterContact(repeated)).toEqual({ phone: 2, email: 2 });
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
  it("keeps a labelled Call now button and the visible number", () => {
    const out = tidyFooterContact(repeated);
    expect(JSON.stringify(out)).toContain("Call now");
    expect(JSON.stringify(out)).toContain("(919) 867-5309");
  });
  it("drops empty text blocks", () => {
    const t = tree(n({ type: "stack", children: [n({ type: "text", text: "  " }), n({ type: "text", text: "Hi" })] }));
    expect(tidyFooterContact(t).root.children).toHaveLength(1);
  });
});

describe("tidyContactSections", () => {
  it("tidies only the contact section", () => {
    const sections = [
      { kind: "hero", settings: { composition: repeated } },
      { kind: "contact", settings: { composition: repeated } },
    ];
    const out = tidyContactSections(sections);
    expect(out[0]).toBe(sections[0]);
    const tidied = (out[1]!.settings as { composition: CompositionTree }).composition;
    expect(countFooterContact(tidied)).toEqual({ phone: 1, email: 1 });
  });
  it("matches an authored contact role", () => {
    const out = tidyContactSections([{ kind: "custom", settings: { role: "contact", composition: repeated } }]);
    expect(countFooterContact((out[0]!.settings as { composition: CompositionTree }).composition)).toEqual({ phone: 1, email: 1 });
  });
});
