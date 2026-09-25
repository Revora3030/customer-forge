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

import { cleanVideoBrief } from "./first-build-chrome.server";
describe("hero video brief", () => {
  it("keeps safe text and drops unsafe or claim-bearing briefs", () => {
    expect(cleanVideoBrief("Slow drift across a gleaming dark car hood at dusk, water beading.")).toMatch(/Slow drift/);
    expect(cleanVideoBrief("<script>x</script> a long enough brief here")).toBeNull();
    expect(cleanVideoBrief("short")).toBeNull();
    expect(cleanVideoBrief("Award-winning team polishing a car at dusk", () => "unsupported claim")).toBeNull();
  });
});

import { resolveSiteHref as r2 } from "./site-chrome";
import { it as it2, expect as ex2 } from "vitest";
it2("maps home and in-page anchors to the site's own front page", () => {
  ex2(r2("/home", "acme", false)).toBe("/s/acme");
  ex2(r2("/#quote", "acme", false)).toBe("/s/acme#quote");
  ex2(r2("/home#services", "acme", false)).toBe("/s/acme#services");
  ex2(r2("/about", "acme", false)).toBe("/s/acme/about");
  ex2(r2("/#quote", "acme", true)).toBe("/#quote");
});
