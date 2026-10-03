import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addMissingNavLinks,
  collectAnchors,
  enquiryPage,
  hasAction,
  repairHref,
  repairTreeLinks,
} from "@/lib/builder/link-integrity";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import { auditSectionDesign } from "@/lib/builder/design-quality";

const pages = [
  { slug: "home", kind: "home", title: "Home" },
  { slug: "services", kind: "page", title: "Services" },
  { slug: "about", kind: "page", title: "About us" },
  { slug: "contact", kind: "page", title: "Contact" },
];

describe("every button goes somewhere real", () => {
  it("leaves good links alone", () => {
    for (const href of [
      "/",
      "/services",
      "/about?x=1",
      "https://example.com",
      "tel:+1 555 123 4567",
      "mailto:a@b.co",
    ])
      expect(repairHref(href, pages)).toBeNull();
  });
  it("repoints a link to a removed page to the closest real page", () => {
    expect(repairHref("/our-services", pages)).toBe("/services");
    expect(repairHref("/about-the-team", pages)).toBe("/about");
    expect(repairHref("/careers", pages)).toBe("/contact");
  });
  it("fixes dead anchors, empty and '#' links", () => {
    expect(repairHref("#contact", pages)).toBe("/contact");
    expect(repairHref("/#pricing", pages)).toBe("/contact");
    expect(repairHref("#", pages)).toBe("/contact");
    expect(repairHref("#services", pages, new Set(["services"]))).toBeNull();
  });
  it("fixes unusable phone and email links", () => {
    expect(repairHref("tel:", pages)).toBe("/contact");
    expect(repairHref("mailto:nobody", pages)).toBe("/contact");
  });
  it("falls back to home when there is no enquiry page", () => {
    expect(repairHref("/gone", [{ slug: "home" }])).toBe("/");
    expect(enquiryPage([{ slug: "home" }, { slug: "book" }])).toBe("/book");
  });
  it("repairs nested buttons, sticky-bar actions and tab panels without touching design", () => {
    const tree: CompositionTree = {
      version: 1,
      root: {
        type: "stack",
        style: { paddingY: 80 },
        children: [
          { type: "button", text: "Book", href: "/booking-page", style: { background: "#112233" } },
          { type: "mobile_sticky_bar", primaryCta: { label: "Call", href: "tel:" } },
          {
            type: "tab_group",
            tabs: [{ label: "A", children: [{ type: "link", text: "x", href: "#nowhere" }] }],
          },
        ],
      },
    };
    const { tree: fixed, fixes } = repairTreeLinks(tree, pages);
    expect(fixes).toHaveLength(3);
    expect(fixed.root.children?.[0]?.href).toBe("/contact");
    expect(fixed.root.children?.[0]?.style?.background).toBe("#112233");
    expect(fixed.root.children?.[1]?.primaryCta?.href).toBe("/contact");
    expect(tree.root.children?.[0]?.href).toBe("/booking-page");
  });
  it("knows the anchors that section roles provide", () => {
    const anchors = collectAnchors([
      { id: "s1", kind: "composition", settings: { role: "service_area" } },
    ]);
    expect(anchors.has("service-area")).toBe(true);
    expect(anchors.has("composition")).toBe(false);
  });
});

describe("the menu always lists every page", () => {
  const header: CompositionTree = {
    version: 1,
    root: {
      type: "row",
      children: [
        { type: "text", text: "Acme" },
        {
          type: "row",
          children: [
            { type: "link", text: "Home", href: "/", style: { size: 15 } },
            { type: "link", text: "Services", href: "/services", style: { size: 15 } },
          ],
        },
        { type: "button", text: "Call", href: "tel:+15551234567" },
      ],
    },
  };
  it("adds pages added later to the existing link group, styled like its links", () => {
    const { tree, added } = addMissingNavLinks(header, [
      { href: "/", title: "Home" },
      { href: "/services", title: "Services" },
      { href: "/gallery", title: "Gallery" },
    ]);
    expect(added).toEqual(["/gallery"]);
    const group = tree.root.children?.[1];
    expect(group?.children?.at(-1)).toMatchObject({
      type: "link",
      text: "Gallery",
      href: "/gallery",
      style: { size: 15 },
    });
  });
  it("changes nothing when every page is already there", () => {
    const { tree, added } = addMissingNavLinks(header, [{ href: "/", title: "Home" }]);
    expect(added).toEqual([]);
    expect(tree).toBe(header);
  });
  it("detects a working action", () => {
    expect(hasAction(header)).toBe(true);
  });
});

describe("buttons are always present and visible", () => {
  it("flags a services or closing section with no button", () => {
    const tree: CompositionTree = {
      version: 1,
      root: {
        type: "stack",
        style: { paddingY: 80 },
        children: [
          { type: "heading", level: 2, text: "Our services", style: { size: 36 } },
          { type: "text", text: "Interior and exterior detailing.", style: { size: 17 } },
        ],
      },
    };
    expect(
      auditSectionDesign(tree, { lead: false, role: "services" }).map((f) => f.code),
    ).toContain("missing_action");
  });
  it("never hides a button or link at any screen size", () => {
    const renderer = readFileSync("src/components/site/CompositionRenderer.tsx", "utf8");
    expect(renderer).toMatch(
      /actionable && rawStyle\.hidden \? \{ \.\.\.rawStyle, hidden: false \}/,
    );
  });
  it("shows every menu link on phones as one scrollable column", () => {
    expect(readFileSync("src/styles.css", "utf8")).toMatch(
      /Every menu link must be visible on a phone/,
    );
  });
  it("requires a call-to-action button in the AI menu bar", () => {
    expect(readFileSync("src/lib/builder/first-build-chrome.server.ts", "utf8")).toMatch(
      /the header needs one primary call-to-action button/,
    );
  });
  it("runs the link check after first builds and after every chat change", () => {
    expect(readFileSync("src/lib/site-engine.worker.server.ts", "utf8")).toMatch(
      /ensureLinkIntegrity\(db as never, orgId\)/,
    );
    expect(readFileSync("src/lib/site-agent.functions.ts", "utf8")).toMatch(
      /ensureLinkIntegrity\(supabase as unknown as never, orgId\)/,
    );
  });
  it("gives sections anchor ids from their role so #contact buttons scroll", () => {
    expect(readFileSync("src/components/site/SiteSections.tsx", "utf8")).toMatch(/id=\{anchor\}/);
  });
});
