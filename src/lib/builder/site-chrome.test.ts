import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectHrefs, readSiteChrome, requiredChromeLinks, resolveSiteHref } from "./site-chrome";

const tree = { version: 1, root: { type: "row", children: [{ type: "link", text: "Home", href: "/" }, { type: "link", text: "About", href: "/about" }] } };

describe("AI-authored site chrome", () => {
  it("reads valid trees and drops invalid ones", () => {
    const chrome = readSiteChrome({ chrome: { header: tree, footer: { root: { type: "script" } } } });
    expect(chrome.header).not.toBeNull();
    expect(chrome.footer).toBeNull();
  });
  it("resolves internal links for the share path only", () => {
    expect(resolveSiteHref("/about", "acme", false)).toBe("/s/acme/about");
    expect(resolveSiteHref("/", "acme", false)).toBe("/s/acme");
    expect(resolveSiteHref("/about", "acme", true)).toBe("/about");
    expect(resolveSiteHref("tel:+15550100", "acme", false)).toBe("tel:+15550100");
  });
  it("requires a link to every real page", () => {
    const required = requiredChromeLinks([{ slug: "home" }, { slug: "about" }, { slug: "thanks", kind: "thanks" }]);
    expect(required).toEqual(["/", "/about"]);
    const hrefs = collectHrefs(readSiteChrome({ chrome: { header: tree } }).header!);
    expect(required.every((h) => hrefs.has(h))).toBe(true);
  });
  it("first builds call Sol for the menu and footer", () => {
    expect(readFileSync("src/lib/site-engine.worker.server.ts", "utf8")).toContain("composeSiteChrome");
  });
});
