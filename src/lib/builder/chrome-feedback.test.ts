import { describe, expect, it, vi } from "vitest";
import type { CompositionTree } from "./composition-tree";

vi.mock("@/lib/ai/hall-of-fame.server", () => ({ callBestThinker: vi.fn() }));

const { chromeFeedback } = await import("./first-build-chrome.server");

const link = (text: string, href: string) => ({ type: "link" as const, text, href, style: {} });

/** website_settings.generation.chrome.header for org 1b332c6c ("Elite mobile detail"), 2026-10-17 02:11Z. */
const liveHeader: CompositionTree = {
  version: 1,
  root: {
    type: "stack",
    style: {},
    children: [
      {
        type: "row",
        style: {},
        children: [
          { type: "heading", level: 1, text: "Elite mobile detail", style: {} },
          {
            type: "row",
            style: {},
            children: [
              link("Home", "/"),
              link("Auto detailing services", "/services"),
              link("Full detailing", "/full-detailing"),
              link("About Elite mobile detail | Raleigh, NC", "/about"),
              link("Auto detailing gallery", "/gallery"),
              link("Detailing questions", "/faq"),
              link("Privacy inquiries", "/privacy"),
              link("Contact Elite mobile detail", "/contact"),
            ],
          },
          { type: "button", text: "Book mobile detail", href: "/contact", style: { background: "#0044CC", paddingX: 16, paddingY: 8 } },
        ],
      },
    ],
  },
};

const ctx = { businessName: "Elite mobile detail" };
const problems = (tree: CompositionTree, kind: "header" | "footer" = "header") => chromeFeedback(kind, tree, ctx).map((issue) => issue.problem);

describe("header/footer design feedback for Sol", () => {
  it("flags the live bare header: no link spacing, a chrome h1 and an unsized action", () => {
    const found = problems(liveHeader);
    expect(found).toContain("space the menu links (gap of at least 8)");
    expect(found).toContain("use text or a link for the wordmark; the page owns its h1");
    expect(found).toContain("set the action's type size");
  });

  it("flags long SEO-style menu labels but not short ones", () => {
    const issues = chromeFeedback("header", liveHeader, ctx).filter((issue) => /short menu labels/.test(issue.problem));
    const paths = issues.map((issue) => issue.path);
    // "About Elite mobile detail | Raleigh, NC" (separator, name, length) and "Contact Elite mobile detail" (name).
    expect(paths).toEqual(["root.children[0].children[1].children[3].text", "root.children[0].children[1].children[7].text"]);
  });

  it("lets the home wordmark link carry the business name", () => {
    const tree: CompositionTree = { version: 1, root: { type: "row", style: { gap: 16 }, children: [
      link("Elite mobile detail", "/"),
      { type: "button", text: "Book", href: "/contact", style: { size: 15 } },
    ] } };
    expect(problems(tree)).toEqual([]);
  });

  it("passes a footer that spaces its links (footer gap 24)", () => {
    const footer: CompositionTree = { version: 1, root: { type: "grid", style: { columns: 3, gap: 24 }, children: [
      { type: "text", text: "Elite mobile detail" },
      { type: "stack", style: { gap: 24 }, children: [link("About", "/about"), link("Contact", "/contact"), link("Gallery", "/gallery"), link("FAQ", "/faq")] },
    ] } };
    expect(problems(footer, "footer")).toEqual([]);
  });

  it("still flags an h1 in the footer", () => {
    const footer: CompositionTree = { version: 1, root: { type: "stack", style: { gap: 24 }, children: [{ type: "heading", level: 1, text: "Elite mobile detail" }] } };
    expect(problems(footer, "footer")).toEqual(["use text or a link for the wordmark; the page owns its h1"]);
  });
});
